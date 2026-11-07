import { X509Certificate, createHash, sign as ecdsaSign } from "node:crypto";
import { documentTotals, renderInvoiceXml, type ZatcaDocument } from "@/lib/zatca-xml";

const sha256 = (data: string | Buffer) => createHash("sha256").update(data);

/** Reads one DER length at `offset`; returns the content start and length. */
function derLength(der: Buffer, offset: number) {
  const first = der[offset + 1];
  if (first < 0x80) return { start: offset + 2, length: first };
  const bytes = first & 0x7f;
  return { start: offset + 2 + bytes, length: der.readUIntBE(offset + 2, bytes) };
}

/** The certificate's own signature: the BIT STRING after tbsCertificate and the algorithm. */
function certificateSignature(der: Buffer) {
  const outer = derLength(der, 0);
  let offset = outer.start;
  for (let i = 0; i < 2; i++) {
    const { start, length } = derLength(der, offset);
    offset = start + length;
  }
  const { start, length } = derLength(der, offset);
  return der.subarray(start + 1, start + length); // skip the unused-bits byte
}

export interface SigningCertificate {
  /** The certificate as Base64 DER, as it appears in the XML. */
  base64: string;
  /** Digest ZATCA expects: Base64 of the hex SHA-256 of the Base64 text. */
  digest: string;
  issuer: string;
  serial: string;
  publicKey: Buffer;
  signature: Buffer;
}

export function readCertificate(base64: string): SigningCertificate {
  const der = Buffer.from(base64, "base64");
  const cert = new X509Certificate(der);
  return {
    base64,
    digest: Buffer.from(sha256(base64).digest("hex")).toString("base64"),
    // Node lists the issuer root first, one per line; XAdES wants it reversed and comma-joined.
    issuer: cert.issuer.split("\n").reverse().join(", "),
    serial: BigInt(`0x${cert.serialNumber}`).toString(),
    publicKey: cert.publicKey.export({ type: "spki", format: "der" }),
    signature: certificateSignature(der),
  };
}

// ZATCA digests this exact text, spacing included. The copy inside the document has the same
// spacing but inherits its namespaces from parent elements instead of declaring them here.
function signedProperties(time: string, cert: SigningCertificate, declareNamespaces: boolean) {
  const ds = declareNamespaces ? ' xmlns:ds="http://www.w3.org/2000/09/xmldsig#"' : "";
  const xades = declareNamespaces ? ' xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"' : "";
  return [
    `<xades:SignedProperties${xades} Id="xadesSignedProperties">`,
    `                                <xades:SignedSignatureProperties>`,
    `                                    <xades:SigningTime>${time}</xades:SigningTime>`,
    `                                    <xades:SigningCertificate>`,
    `                                        <xades:Cert>`,
    `                                            <xades:CertDigest>`,
    `                                                <ds:DigestMethod${ds} Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>`,
    `                                                <ds:DigestValue${ds}>${cert.digest}</ds:DigestValue>`,
    `                                            </xades:CertDigest>`,
    `                                            <xades:IssuerSerial>`,
    `                                                <ds:X509IssuerName${ds}>${cert.issuer}</ds:X509IssuerName>`,
    `                                                <ds:X509SerialNumber${ds}>${cert.serial}</ds:X509SerialNumber>`,
    `                                            </xades:IssuerSerial>`,
    `                                        </xades:Cert>`,
    `                                    </xades:SigningCertificate>`,
    `                                </xades:SignedSignatureProperties>`,
    `                            </xades:SignedProperties>`,
  ].join("\n");
}

function extensions(
  invoiceHash: string,
  signature: string,
  time: string,
  cert: SigningCertificate,
) {
  const propertiesDigest = Buffer.from(
    sha256(signedProperties(time, cert, true)).digest("hex"),
  ).toString("base64");
  const xpath = (expr: string) =>
    `<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116"><ds:XPath>${expr}</ds:XPath></ds:Transform>`;
  return (
    `<ext:UBLExtensions><ext:UBLExtension>` +
    `<ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>` +
    `<ext:ExtensionContent>` +
    `<sig:UBLDocumentSignatures xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2" xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2" xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2">` +
    `<sac:SignatureInformation>` +
    `<cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>` +
    `<sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>` +
    `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="signature">` +
    `<ds:SignedInfo>` +
    `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>` +
    `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>` +
    `<ds:Reference Id="invoiceSignedData" URI="">` +
    `<ds:Transforms>` +
    xpath("not(//ancestor-or-self::ext:UBLExtensions)") +
    xpath("not(//ancestor-or-self::cac:Signature)") +
    xpath("not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])") +
    `<ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>` +
    `</ds:Transforms>` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
    `<ds:DigestValue>${invoiceHash}</ds:DigestValue>` +
    `</ds:Reference>` +
    `<ds:Reference Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties" URI="#xadesSignedProperties">` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
    `<ds:DigestValue>${propertiesDigest}</ds:DigestValue>` +
    `</ds:Reference>` +
    `</ds:SignedInfo>` +
    `<ds:SignatureValue>${signature}</ds:SignatureValue>` +
    `<ds:KeyInfo><ds:X509Data><ds:X509Certificate>${cert.base64}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>` +
    `<ds:Object>` +
    `<xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="signature">` +
    `\n                            ${signedProperties(time, cert, false)}\n` +
    `</xades:QualifyingProperties>` +
    `</ds:Object>` +
    `</ds:Signature>` +
    `</sac:SignatureInformation>` +
    `</sig:UBLDocumentSignatures>` +
    `</ext:ExtensionContent>` +
    `</ext:UBLExtension></ext:UBLExtensions>`
  );
}

/** Tag-length-value with one-byte lengths, as ZATCA's QR defines it. */
function tlv(values: (string | Buffer)[]) {
  const parts = values.map((value, i) => {
    const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : value;
    if (bytes.length > 255) throw new Error(`QR tag ${i + 1} is too long`);
    return Buffer.concat([Buffer.from([i + 1, bytes.length]), bytes]);
  });
  return Buffer.concat(parts).toString("base64");
}

export interface SignedInvoice {
  xml: string;
  /** Base64 SHA-256 of the canonical document; the next document's previous hash. */
  hash: string;
  qr: string;
}

/** Hashes, signs and stamps a document. `signingTime` is YYYY-MM-DDTHH:MM:SS. */
export function signInvoice(
  doc: ZatcaDocument,
  privateKeyPem: string,
  certificateBase64: string,
  signingTime: string,
): SignedInvoice {
  const cert = readCertificate(certificateBase64);
  const digest = sha256(renderInvoiceXml(doc)).digest();
  const hash = digest.toString("base64");
  // ZATCA signs the hash, and ECDSA-SHA256 hashes its input again: that is the specified flow.
  const signature = ecdsaSign("sha256", digest, privateKeyPem).toString("base64");

  const totals = documentTotals(doc.lines);
  const tags: (string | Buffer)[] = [
    doc.seller.name,
    doc.seller.vatNumber,
    `${doc.issueDate}T${doc.issueTime}`,
    totals.total.toFixed(2),
    totals.vat.toFixed(2),
    hash,
    signature,
    cert.publicKey,
  ];
  if (doc.kind === "simplified") tags.push(cert.signature);
  const qr = tlv(tags);

  return {
    xml: renderInvoiceXml(doc, { extensions: extensions(hash, signature, signingTime, cert), qr }),
    hash,
    qr,
  };
}
