import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { auditRouter } from './routes/audit';
import { productCategoriesRouter } from './routes/productCategories';
import { productsRouter } from './routes/products';
import { unitsRouter } from './routes/units';
import { priceLevelsRouter } from './routes/priceLevels';
import { customersRouter } from './routes/customers';
import { suppliersRouter } from './routes/suppliers';
import { warehousesRouter } from './routes/warehouses';
import { salespersonsRouter } from './routes/salespersons';
import { taxProfilesRouter } from './routes/taxProfiles';
import { paymentTermsRouter } from './routes/paymentTerms';

export const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/audit-logs', auditRouter);
app.use('/product-categories', productCategoriesRouter);
app.use('/products', productsRouter);
app.use('/units', unitsRouter);
app.use('/price-levels', priceLevelsRouter);
app.use('/customers', customersRouter);
app.use('/suppliers', suppliersRouter);
app.use('/warehouses', warehousesRouter);
app.use('/salespersons', salespersonsRouter);
app.use('/tax-profiles', taxProfilesRouter);
app.use('/payment-terms', paymentTermsRouter);
