import 'reflect-metadata';

import { DataSource } from 'typeorm';
import * as path from 'path';
import { User } from './entities/User';
import { Role } from './entities/Role';
import { Permission } from './entities/Permission';
import { AuditLog } from './entities/AuditLog';
import { Branch } from './entities/Branch';
import { PaymentTerms } from './entities/PaymentTerms';
import { TaxProfile } from './entities/TaxProfile';
import { ProductCategory } from './entities/ProductCategory';
import { UnitOfMeasure } from './entities/UnitOfMeasure';
import { PriceLevel } from './entities/PriceLevel';
import { Product } from './entities/Product';
import { ProductPrice } from './entities/ProductPrice';
import { Customer } from './entities/Customer';
import { Supplier } from './entities/Supplier';
import { Warehouse } from './entities/Warehouse';
import { Salesperson } from './entities/Salesperson';
import { InventoryMovement } from './entities/InventoryMovement';
import { StockBalance } from './entities/StockBalance';
import { Account } from './entities/Account';
import { JournalEntry } from './entities/JournalEntry';
import { JournalLine } from './entities/JournalLine';
import { Quotation } from './entities/Quotation';
import { QuotationLine } from './entities/QuotationLine';
import { SalesOrder } from './entities/SalesOrder';
import { SalesOrderLine } from './entities/SalesOrderLine';
import { Invoice } from './entities/Invoice';
import { InvoiceLine } from './entities/InvoiceLine';
import { Receipt } from './entities/Receipt';
import { ReceiptAllocation } from './entities/ReceiptAllocation';

export const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/tradeflow',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  entities: [
    User,
    Role,
    Permission,
    AuditLog,
    Branch,
    PaymentTerms,
    TaxProfile,
    ProductCategory,
    UnitOfMeasure,
    PriceLevel,
    Product,
    ProductPrice,
    Customer,
    Supplier,
    Warehouse,
    Salesperson,
    InventoryMovement,
    StockBalance,
    Account,
    JournalEntry,
    JournalLine,
    Quotation,
    QuotationLine,
    SalesOrder,
    SalesOrderLine,
    Invoice,
    InvoiceLine,
    Receipt,
    ReceiptAllocation,
  ],
  // Use globs so TypeORM can discover migrations both in dev (ts-node) and in prod (compiled js).
  migrations: [
    path.join(__dirname, 'migrations', '*.ts'),
    path.join(__dirname, 'migrations', '*.js'),
  ],
});
