import { useGetSale } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { format } from "date-fns";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

export default function Invoice() {
  const params = useParams();
  const saleId = parseInt(params.id as string, 10);
  const { data: sale, isLoading, error } = useGetSale(saleId, { query: { enabled: !!saleId } });

  useEffect(() => {
    if (sale) {
      setTimeout(() => {
        window.print();
      }, 500);
    }
  }, [sale]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "PKR",
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !sale) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-destructive">
        Error loading invoice.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 font-sans text-gray-900 flex flex-col items-center">
      <div className="no-print mb-4">
        <Button onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print Invoice
        </Button>
      </div>

      {/* A4 Size Container */}
      <div className="bg-white w-full max-w-[210mm] min-h-[297mm] p-[20mm] shadow-lg print-only:shadow-none print-only:w-full print-only:max-w-none print-only:p-[10mm]">
        
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-gray-800 pb-6 mb-8">
          <div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tight">BranX<span className="text-red-500">*</span></h1>
            <p className="text-gray-600 mt-1">Retail Excellence</p>
            <div className="mt-4 text-sm text-gray-600">
              <p>123 Commerce St.</p>
              <p>Metropolis, NY 10001</p>
              <p>Phone: (555) 123-4567</p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-2xl font-light text-gray-400 uppercase tracking-widest">Invoice</h2>
            <div className="mt-4 text-sm">
              <p className="flex justify-end gap-4"><span className="text-gray-500 font-medium">Invoice No:</span> <span className="font-mono">#{sale.id.toString().padStart(6, '0')}</span></p>
              <p className="flex justify-end gap-4"><span className="text-gray-500 font-medium">Date:</span> <span>{format(new Date(sale.createdAt), "MMM dd, yyyy")}</span></p>
              <p className="flex justify-end gap-4"><span className="text-gray-500 font-medium">Time:</span> <span>{format(new Date(sale.createdAt), "hh:mm a")}</span></p>
              <p className="flex justify-end gap-4"><span className="text-gray-500 font-medium">Cashier:</span> <span>{sale.cashierName || `User #${sale.cashierId}`}</span></p>
              <p className="flex justify-end gap-4"><span className="text-gray-500 font-medium">Customer:</span> <span className="font-semibold">{sale.customerName || "Walk-in"}</span></p>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full text-left border-collapse mb-8">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="py-3 px-2 font-medium text-gray-500 uppercase text-xs tracking-wider">Item / Barcode</th>
              <th className="py-3 px-2 font-medium text-gray-500 uppercase text-xs tracking-wider text-center">Qty</th>
              <th className="py-3 px-2 font-medium text-gray-500 uppercase text-xs tracking-wider text-right">Price</th>
              <th className="py-3 px-2 font-medium text-gray-500 uppercase text-xs tracking-wider text-right">Total</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {sale.items.map((item, index) => (
              <tr key={index} className="border-b border-gray-100 last:border-b-0">
                <td className="py-4 px-2">
                  <div className="font-medium text-gray-900">{item.productName}</div>
                  <div className="text-gray-500 font-mono text-xs mt-1">{item.barcode}</div>
                </td>
                <td className="py-4 px-2 text-center text-gray-700">{item.quantity}</td>
                <td className="py-4 px-2 text-right text-gray-700">{formatCurrency(item.price)}</td>
                <td className="py-4 px-2 text-right font-medium text-gray-900">{formatCurrency(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end pt-4 border-t-2 border-gray-200">
          <div className="w-1/2 max-w-[300px]">
            <div className="flex justify-between py-2 text-gray-600">
              <span>Subtotal</span>
              <span>{formatCurrency(sale.totalAmount)}</span>
            </div>
            <div className="flex justify-between py-2 text-gray-600">
              <span>Tax (0%)</span>
              <span>{formatCurrency(0)}</span>
            </div>
            <div className="flex justify-between py-4 mt-2 border-t border-gray-200 text-xl font-bold text-gray-900">
              <span>Total</span>
              <span>{formatCurrency(sale.totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-gray-200 text-center text-gray-500 text-sm">
          <p>Thank you for your business!</p>
          <p className="mt-1">Returns accepted within 30 days with original receipt.</p>
        </div>

      </div>
    </div>
  );
}
