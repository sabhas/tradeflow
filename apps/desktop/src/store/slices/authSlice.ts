import { createSlice } from '@reduxjs/toolkit';

interface User {
  id: string;
  email: string;
  name: string;
  branchId?: string;
  createdAt: string;
  updatedAt: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  permissions: string[];
}

const loadStored = (): Partial<AuthState> => {
  try {
    const t = localStorage.getItem('tradeflow_token');
    const u = localStorage.getItem('tradeflow_user');
    const p = localStorage.getItem('tradeflow_permissions');
    return {
      token: t || null,
      user: u ? JSON.parse(u) : null,
      permissions: p ? JSON.parse(p) : [],
    };
  } catch {
    return {};
  }
};

const initialState: AuthState = {
  user: null,
  token: null,
  permissions: [],
  ...loadStored(),
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (state, action) => {
      const { user, token, permissions } = action.payload;
      state.user = user;
      state.token = token;
      state.permissions = permissions || [];
      if (token) localStorage.setItem('tradeflow_token', token);
      if (user) localStorage.setItem('tradeflow_user', JSON.stringify(user));
      if (permissions) localStorage.setItem('tradeflow_permissions', JSON.stringify(permissions));
    },
    updateUser: (state, action) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
        localStorage.setItem('tradeflow_user', JSON.stringify(state.user));
      }
    },
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.permissions = [];
      localStorage.removeItem('tradeflow_token');
      localStorage.removeItem('tradeflow_user');
      localStorage.removeItem('tradeflow_permissions');
    },
  },
});

export const { setCredentials, updateUser, logout } = authSlice.actions;
export default authSlice.reducer;

export const selectUser = (s: { auth: AuthState }) => s.auth.user;
export const selectToken = (s: { auth: AuthState }) => s.auth.token;
export const selectPermissions = (s: { auth: AuthState }) => s.auth.permissions;
export const selectIsAuthenticated = (s: { auth: AuthState }) => !!s.auth.token;
