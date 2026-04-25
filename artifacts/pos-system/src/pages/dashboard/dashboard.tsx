import {
  useGetDashboardSummary,
  useGetSalesChart,
  useGetTopProducts,
  useGetLowStockProducts,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { 
  DollarSign, 
  ShoppingCart, 
  Package, 
  AlertTriangle,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: summary } = useGetDashboardSummary();
  const { data: chartData } = useGetSalesChart({ days: 7 });
  const { data: topProducts } = useGetTopProducts({ limit: 5 });
  const { data: lowStock } = useGetLowStockProducts({ threshold: 10 });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "PKR",
    }).format(amount);
  };

  return (
    <ScrollArea className="h-full">
      <div className="flex-1 space-y-6 p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            {format(new Date(), "EEEE, MMMM do, yyyy")}
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Revenue
              </CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {summary ? formatCurrency(summary.totalRevenue) : "Rs 0"}
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center">
                <TrendingUp className="h-3 w-3 mr-1 text-emerald-500" />
                <span className="text-emerald-500 font-medium">Daily Update</span>
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Orders
              </CardTitle>
              <ShoppingCart className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {summary?.totalOrders || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center">
                <ArrowUpRight className="h-3 w-3 mr-1 text-emerald-500" />
                <span className="text-emerald-500 font-medium">Daily Update</span>
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Products
              </CardTitle>
              <Package className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {summary?.totalProducts || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Active in catalog
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Low Stock Alerts
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {summary?.lowStockCount || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center">
                {summary?.lowStockCount && summary.lowStockCount > 0 ? (
                  <>
                    <ArrowDownRight className="h-3 w-3 mr-1 text-destructive" />
                    <span className="text-destructive font-medium">Needs Attention</span>
                  </>
                ) : (
                  <span className="text-emerald-500 font-medium">All Good</span>
                )}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts & Lists */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          {/* Sales Trend Chart */}
          <Card className="col-span-4 bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg font-medium">Sales Trend (Last 7 Days)</CardTitle>
            </CardHeader>
            <CardContent className="pl-0">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData || []}
                    margin={{
                      top: 5,
                      right: 10,
                      left: 10,
                      bottom: 0,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return format(date, "MMM d");
                      }}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `Rs ${value}`}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "var(--radius)" }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                      labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                      formatter={(value: number) => [formatCurrency(value), "Revenue"]}
                      labelFormatter={(label) => format(new Date(label), "MMMM d, yyyy")}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="hsl(var(--primary))"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 6, fill: "hsl(var(--primary))", stroke: "hsl(var(--background))", strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Top Products */}
          <Card className="col-span-3 bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg font-medium">Top Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {topProducts?.map((product, index) => (
                  <div key={product.productId} className="flex items-center">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm mr-4">
                      {index + 1}
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none text-foreground">
                        {product.productName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {product.totalQuantity} sold
                      </p>
                    </div>
                    <div className="font-medium text-foreground">
                      {formatCurrency(product.totalRevenue)}
                    </div>
                  </div>
                ))}
                {(!topProducts || topProducts.length === 0) && (
                  <div className="text-center text-sm text-muted-foreground py-4">
                    No sales data available yet.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Low Stock Alerts */}
          <Card className="col-span-4 lg:col-span-7 bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Low Stock Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {lowStock?.map((product) => {
                  // Sized products track stock per variant; products.stock is
                  // unused for them. Match the inventory page so the badge
                  // reflects what the cashier actually sees on the floor.
                  const displayedStock =
                    product.variants && product.variants.length > 0
                      ? product.variants.reduce(
                          (sum, v) => sum + (v.stock ?? 0),
                          0,
                        )
                      : product.stock;
                  return (
                    <div key={product.id} className="flex items-center justify-between p-4 border border-destructive/20 bg-destructive/5 rounded-lg">
                      <div className="space-y-1">
                        <p className="text-sm font-medium leading-none text-foreground line-clamp-1" title={product.name}>
                          {product.name}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {product.barcode}
                        </p>
                      </div>
                      <Badge variant="destructive" className="ml-2 shrink-0">
                        {displayedStock} left
                      </Badge>
                    </div>
                  );
                })}
                {(!lowStock || lowStock.length === 0) && (
                  <div className="col-span-full text-center text-sm text-muted-foreground py-8">
                    All products are well stocked.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ScrollArea>
  );
}
