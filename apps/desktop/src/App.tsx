import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { ProtectedLayout } from './layouts/ProtectedLayout';
import { DashboardPage } from './pages/DashboardPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { ProductCategoriesPage } from './pages/masters/ProductCategoriesPage';
import { ProductsPage } from './pages/masters/ProductsPage';
import { UnitsPage } from './pages/masters/UnitsPage';
import { PriceLevelsPage } from './pages/masters/PriceLevelsPage';
import { CustomersPage } from './pages/masters/CustomersPage';
import { SuppliersPage } from './pages/masters/SuppliersPage';
import { WarehousesPage } from './pages/masters/WarehousesPage';
import { SalespersonsPage } from './pages/masters/SalespersonsPage';
import { TaxProfilesPage } from './pages/masters/TaxProfilesPage';
import { PaymentTermsPage } from './pages/masters/PaymentTermsPage';
import { InventoryStockPage } from './pages/inventory/InventoryStockPage';
import { InventoryMovementsPage } from './pages/inventory/InventoryMovementsPage';
import { InventoryOpeningBalancePage } from './pages/inventory/InventoryOpeningBalancePage';
import { InventoryAdjustmentPage } from './pages/inventory/InventoryAdjustmentPage';
import { QuotationsPage } from './pages/sales/QuotationsPage';
import { SalesOrdersPage } from './pages/sales/SalesOrdersPage';
import { InvoicesPage } from './pages/sales/InvoicesPage';
import { ReceiptsPage } from './pages/sales/ReceiptsPage';
import { SalesReportsPage } from './pages/sales/SalesReportsPage';
import { PurchaseOrdersPage } from './pages/purchases/PurchaseOrdersPage';
import { GrnsPage } from './pages/purchases/GrnsPage';
import { SupplierInvoicesPage } from './pages/purchases/SupplierInvoicesPage';
import { SupplierPaymentsPage } from './pages/purchases/SupplierPaymentsPage';
import { PurchaseReportsPage } from './pages/purchases/PurchaseReportsPage';
import { useAppSelector } from './hooks/useAppSelector';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuth = useAppSelector((s) => s.auth.token);
  if (!isAuth) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LoginRoute() {
  const isAuth = useAppSelector((s) => s.auth.token);
  if (isAuth) return <Navigate to="/" replace />;
  return <LoginPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <ProtectedLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="audit-logs" element={<AuditLogsPage />} />
          <Route path="masters/product-categories" element={<ProductCategoriesPage />} />
          <Route path="masters/products" element={<ProductsPage />} />
          <Route path="masters/units" element={<UnitsPage />} />
          <Route path="masters/price-levels" element={<PriceLevelsPage />} />
          <Route path="masters/customers" element={<CustomersPage />} />
          <Route path="masters/suppliers" element={<SuppliersPage />} />
          <Route path="masters/warehouses" element={<WarehousesPage />} />
          <Route path="masters/salespersons" element={<SalespersonsPage />} />
          <Route path="masters/tax-profiles" element={<TaxProfilesPage />} />
          <Route path="masters/payment-terms" element={<PaymentTermsPage />} />
          <Route path="inventory" element={<Navigate to="/inventory/stock" replace />} />
          <Route path="inventory/stock" element={<InventoryStockPage />} />
          <Route path="inventory/movements" element={<InventoryMovementsPage />} />
          <Route path="inventory/opening-balance" element={<InventoryOpeningBalancePage />} />
          <Route path="inventory/adjustment" element={<InventoryAdjustmentPage />} />
          <Route path="sales" element={<Navigate to="/sales/quotations" replace />} />
          <Route path="sales/quotations" element={<QuotationsPage />} />
          <Route path="sales/orders" element={<SalesOrdersPage />} />
          <Route path="sales/invoices" element={<InvoicesPage />} />
          <Route path="sales/receipts" element={<ReceiptsPage />} />
          <Route path="sales/reports" element={<SalesReportsPage />} />
          <Route path="purchases" element={<Navigate to="/purchases/orders" replace />} />
          <Route path="purchases/orders" element={<PurchaseOrdersPage />} />
          <Route path="purchases/grns" element={<GrnsPage />} />
          <Route path="purchases/invoices" element={<SupplierInvoicesPage />} />
          <Route path="purchases/payments" element={<SupplierPaymentsPage />} />
          <Route path="purchases/reports" element={<PurchaseReportsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
