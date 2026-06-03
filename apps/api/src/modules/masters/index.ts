import type { Express } from 'express';
import { productCategoriesRouter } from './routes/productCategories';
import { productsRouter } from './routes/products';
import { unitsRouter } from './routes/units';
import { priceLevelsRouter } from './routes/priceLevels';
import { bonusRulesRouter } from './routes/bonusRules';
import { customersRouter } from './routes/customers';
import { townsRouter } from './routes/towns';
import { areasRouter } from './routes/areas';
import { customerTypesRouter } from './routes/customerTypes';
import { suppliersRouter } from './routes/suppliers';
import { warehousesRouter } from './routes/warehouses';
import { salespersonsRouter } from './routes/salespersons';
import { taxProfilesRouter } from './routes/taxProfiles';
import { paymentTermsRouter } from './routes/paymentTerms';

export function registerMastersRoutes(app: Express): void {
  app.use('/product-categories', productCategoriesRouter);
  app.use('/products', productsRouter);
  app.use('/units', unitsRouter);
  app.use('/price-levels', priceLevelsRouter);
  app.use('/bonus-rules', bonusRulesRouter);
  app.use('/customers', customersRouter);
  app.use('/towns', townsRouter);
  app.use('/areas', areasRouter);
  app.use('/customer-types', customerTypesRouter);
  app.use('/suppliers', suppliersRouter);
  app.use('/warehouses', warehousesRouter);
  app.use('/salespersons', salespersonsRouter);
  app.use('/tax-profiles', taxProfilesRouter);
  app.use('/payment-terms', paymentTermsRouter);
}
