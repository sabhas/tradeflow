import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  clampMoneyDecimals,
  readStoredMoneyDecimals,
  writeStoredMoneyDecimals,
} from '../../lib/moneyDecimalsStorage';
import { THEME_STORAGE_KEY, readStoredTheme, type ThemeMode } from '../../lib/theme';

interface AppState {
  sidebarOpen: boolean;
  theme: ThemeMode;
  /** Display / input precision for money amounts (synced from company settings when available). */
  amountFractionDigits: number;
}

const initialState: AppState = {
  sidebarOpen: true,
  theme: readStoredTheme(),
  amountFractionDigits: readStoredMoneyDecimals(),
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setTheme: (state, action: PayloadAction<ThemeMode>) => {
      state.theme = action.payload;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, action.payload);
      } catch {
        /* ignore */
      }
    },
    setAmountFractionDigits: (state, action: PayloadAction<number>) => {
      const next = clampMoneyDecimals(action.payload);
      state.amountFractionDigits = next;
      writeStoredMoneyDecimals(next);
    },
  },
});

export const { toggleSidebar, setTheme, setAmountFractionDigits } = appSlice.actions;
export default appSlice.reducer;
