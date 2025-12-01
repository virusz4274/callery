
import type { Invoice } from '../types';

const generateInvoice = (id: number, monthsAgo: number, amount: number, status: 'Paid' | 'Pending' | 'Failed'): Invoice => {
  const date = new Date();
  date.setMonth(date.getMonth() - monthsAgo);
  return {
    id: `inv_${id}`,
    date: date.toISOString(),
    amount,
    status,
  };
};

export const invoices: Invoice[] = [
    generateInvoice(1, 1, 15.00, 'Paid'),
    generateInvoice(2, 2, 15.00, 'Paid'),
    generateInvoice(3, 3, 15.00, 'Paid'),
    generateInvoice(4, 4, 15.00, 'Paid'),
];
