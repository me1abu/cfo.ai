import { queryOptions } from "@tanstack/react-query";
import { listInvoices, getInvoice } from "@/server/invoices";
import { listCustomers } from "@/server/customers";
import { getCompany } from "@/server/company";
import { getSettings } from "@/server/profile";

// Central query definitions so route loaders (SSR prefetch) and components share keys.
export const invoicesQuery = () =>
  queryOptions({ queryKey: ["invoices"], queryFn: () => listInvoices() });

export const invoiceQuery = (id: string) =>
  queryOptions({ queryKey: ["invoices", id], queryFn: () => getInvoice({ data: { id } }) });

export const customersQuery = () =>
  queryOptions({ queryKey: ["customers"], queryFn: () => listCustomers() });

export const companyQuery = () =>
  queryOptions({ queryKey: ["company"], queryFn: () => getCompany() });

export const settingsQuery = () =>
  queryOptions({ queryKey: ["settings"], queryFn: () => getSettings() });
