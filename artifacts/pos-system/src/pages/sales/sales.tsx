import { useState } from "react";
import { useListSales, ListSalesPeriod, Sale } from "@workspace/api-client-react";
import { format } from "date-fns";
import { SaleDetailsDialog } from "@/components/sales/sale-details-dialog";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Eye, SearchX } from "lucide-react";

export default function Sales() {
  const [period, setPeriod] = useState<ListSalesPeriod>("today");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const { data: sales, isLoading } = useListSales({ period });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "PKR",
    }).format(amount);
  };

  return (
    <div className="flex flex-col h-full bg-background p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Sales History</h2>
          <p className="text-muted-foreground mt-1">View past transactions.</p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as ListSalesPeriod)}>
          <SelectTrigger className="w-[180px] bg-card font-medium">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 rounded-lg border border-border bg-card overflow-hidden flex flex-col shadow-sm">
        <ScrollArea className="flex-1">
          <Table>
            <TableHeader className="bg-secondary/50 sticky top-0 z-10">
              <TableRow>
                <TableHead>Receipt No.</TableHead>
                <TableHead>Date & Time</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Cashier</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
                      Loading sales history...
                    </div>
                  </TableCell>
                </TableRow>
              ) : sales?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <SearchX className="h-12 w-12 mb-4 opacity-20" />
                      <p className="text-lg font-medium">No sales found</p>
                      <p className="text-sm">Try selecting a different time period.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                sales?.map((sale) => (
                  <TableRow 
                    key={sale.id} 
                    className="hover:bg-secondary/30 transition-colors cursor-pointer group"
                    onClick={() => setSelectedSale(sale)}
                  >
                    <TableCell className="font-mono text-muted-foreground">
                      #{sale.id.toString().padStart(6, '0')}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground">
                        {format(new Date(sale.createdAt), "MMM d, yyyy")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(sale.createdAt), "h:mm a")}
                      </div>
                    </TableCell>
                    <TableCell>
                      {sale.items.length} item{sale.items.length !== 1 ? 's' : ''}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-foreground">
                        <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold uppercase">
                          {(sale.cashierName || "U").charAt(0)}
                        </div>
                        {sale.cashierName || `User ${sale.cashierId}`}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-bold text-foreground">
                      {formatCurrency(sale.totalAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:text-primary"
                        onClick={(e) => { e.stopPropagation(); setSelectedSale(sale); }}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      <SaleDetailsDialog
        sale={selectedSale}
        open={!!selectedSale}
        onClose={() => setSelectedSale(null)}
      />
    </div>
  );
}
