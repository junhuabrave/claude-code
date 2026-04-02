---
name: react-dev
description: React/TypeScript development conventions, component patterns, state management, private npm registry, testing, and build tooling.
---

# React Developer Skill

## Toolchain & Project Setup

### Preferred stack

| Layer | Choice |
|-------|--------|
| Framework | **Next.js 14+** (App Router) for full-stack · **Vite + React** for SPA |
| Language | **TypeScript** (strict mode, always) |
| Styling | **Tailwind CSS** + **shadcn/ui** components |
| State (local) | `useState` / `useReducer` / `Context` |
| State (global/server) | **Zustand** (client) · **TanStack Query** (server) |
| Forms | **React Hook Form** + **Zod** |
| HTTP | **axios** or native `fetch` wrapped in TanStack Query |
| Testing | **Vitest** + **React Testing Library** + **Playwright** |
| Linting | **ESLint** + **Prettier** |
| Package manager | **pnpm** (preferred) · npm fallback |

### Bootstrap commands

```bash
# Next.js (preferred for new projects)
pnpm create next-app@latest my-app --typescript --tailwind --app --src-dir --import-alias "@/*"

# Vite SPA
pnpm create vite my-app --template react-ts
```

---

## Private npm Registry

Internal component libraries and packages are on a private npm registry.

### `.npmrc` (project root — commit this, without the token)

```ini
# .npmrc
@company:registry=https://npm.internal.company.com/
//npm.internal.company.com/:_authToken=${NPM_PRIVATE_TOKEN}
```

### Environment variables required

| Variable | Purpose |
|----------|---------|
| `NPM_PRIVATE_TOKEN` | Auth token for the private registry |
| `NPM_PRIVATE_REGISTRY` | Registry base URL |

### Installing private packages

```bash
# Set token once (stored in ~/.npmrc)
npm config set //npm.internal.company.com/:_authToken $NPM_PRIVATE_TOKEN

# Install private package
pnpm add @company/design-system @company/auth-utils

# In CI (set env var, .npmrc handles auth automatically)
NPM_PRIVATE_TOKEN=${{ secrets.NPM_PRIVATE_TOKEN }} pnpm install
```

### Using private packages

```typescript
// Treat them like any npm package
import { Button, Modal } from '@company/design-system'
import { useAuth } from '@company/auth-utils'
```

---

## Project Structure (Next.js App Router)

```
my-app/
├── src/
│   ├── app/                    # App Router pages & layouts
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Home page
│   │   ├── (auth)/             # Route groups
│   │   │   ├── login/
│   │   │   └── register/
│   │   └── dashboard/
│   │       ├── layout.tsx
│   │       └── page.tsx
│   │
│   ├── components/
│   │   ├── ui/                 # Primitive UI (shadcn/ui goes here)
│   │   ├── forms/              # Form components
│   │   ├── layout/             # Header, Footer, Sidebar
│   │   └── features/           # Feature-specific components
│   │       └── auth/
│   │           ├── LoginForm.tsx
│   │           └── LoginForm.test.tsx   # co-located tests
│   │
│   ├── hooks/                  # Custom hooks
│   ├── lib/                    # Utilities, API clients, helpers
│   │   ├── api.ts              # Axios/fetch instance
│   │   ├── utils.ts            # cn() and misc utils
│   │   └── validations.ts      # Shared Zod schemas
│   ├── stores/                 # Zustand stores
│   ├── types/                  # Shared TypeScript types
│   └── styles/
│       └── globals.css
│
├── public/
├── tests/                      # Integration & e2e tests
│   └── e2e/                    # Playwright tests
├── .env.local                  # secrets (never commit)
├── .env.example                # committed template
├── .npmrc                      # registry config (no token)
└── next.config.ts
```

---

## TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "moduleResolution": "bundler",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

---

## Component Patterns

### Standard functional component

```tsx
// components/features/users/UserCard.tsx
import type { FC } from 'react'
import { cn } from '@/lib/utils'

interface UserCardProps {
  user: User
  className?: string
  onSelect?: (id: string) => void
}

export const UserCard: FC<UserCardProps> = ({ user, className, onSelect }) => {
  return (
    <div
      className={cn('rounded-lg border p-4 shadow-sm', className)}
      onClick={() => onSelect?.(user.id)}
    >
      <h3 className="font-semibold">{user.name}</h3>
      <p className="text-sm text-muted-foreground">{user.email}</p>
    </div>
  )
}
```

### Rules
- **One component per file.** File name = component name.
- **Named exports only** — no `export default` (makes refactoring easier).
- **Props interface** declared above the component, prefixed with component name.
- **`FC<Props>` type** on all components.
- **`cn()` utility** for conditional classNames (from `clsx` + `tailwind-merge`).

---

## Custom Hooks

```tsx
// hooks/useDebounce.ts
import { useState, useEffect } from 'react'

export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
```

### Hook rules
- Prefix with `use`.
- One responsibility per hook.
- Co-locate with the component if only used there; move to `hooks/` when shared.
- Return objects `{ data, isLoading, error }` not tuples (unless it's a useState-style pair).

---

## State Management

### Local state — `useState` / `useReducer`

Use for component-scoped UI state (open/closed, form dirty state, etc.)

### Global client state — Zustand

```typescript
// stores/useAuthStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  user: User | null
  token: string | null
  login: (user: User, token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      login: (user, token) => set({ user, token }),
      logout: () => set({ user: null, token: null }),
    }),
    { name: 'auth-storage' }
  )
)
```

### Server state — TanStack Query

```typescript
// lib/api/users.ts — query/mutation definitions
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export const userKeys = {
  all: ['users'] as const,
  detail: (id: string) => ['users', id] as const,
}

export function useUsers() {
  return useQuery({
    queryKey: userKeys.all,
    queryFn: () => api.get<User[]>('/users').then(r => r.data),
    staleTime: 5 * 60 * 1000,  // 5 minutes
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateUserInput) => api.post<User>('/users', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  })
}
```

---

## Forms

```tsx
// components/features/users/CreateUserForm.tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email'),
  role: z.enum(['admin', 'viewer']).default('viewer'),
})

type FormValues = z.infer<typeof schema>

export const CreateUserForm: FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })
  const createUser = useCreateUser()

  const onSubmit = async (data: FormValues) => {
    await createUser.mutateAsync(data)
    onSuccess()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <input {...register('name')} placeholder="Name" />
      {errors.name && <p className="text-red-500 text-sm">{errors.name.message}</p>}
      {/* ... */}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating…' : 'Create User'}
      </button>
    </form>
  )
}
```

---

## API Client

```typescript
// lib/api.ts
import axios from 'axios'
import { useAuthStore } from '@/stores/useAuthStore'

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 10_000,
})

// Attach auth token automatically
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
    }
    return Promise.reject(error)
  }
)
```

---

## Testing

### Unit/Integration — Vitest + React Testing Library

```typescript
// components/features/users/UserCard.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { UserCard } from './UserCard'

const mockUser: User = { id: '1', name: 'Alice', email: 'alice@example.com' }

describe('UserCard', () => {
  it('renders user name and email', () => {
    render(<UserCard user={mockUser} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
  })

  it('calls onSelect with user id when clicked', () => {
    const onSelect = vi.fn()
    render(<UserCard user={mockUser} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Alice'))
    expect(onSelect).toHaveBeenCalledWith('1')
  })
})
```

### E2E — Playwright

```typescript
// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test'

test('user can log in and see dashboard', async ({ page }) => {
  await page.goto('/login')
  await page.fill('[name=email]', 'alice@example.com')
  await page.fill('[name=password]', 'password123')
  await page.click('button[type=submit]')
  await expect(page).toHaveURL('/dashboard')
  await expect(page.getByText('Welcome, Alice')).toBeVisible()
})
```

### Test commands

```bash
pnpm test             # vitest watch
pnpm test:run         # vitest single run
pnpm test:coverage    # coverage report
pnpm test:e2e         # playwright
pnpm test:e2e:ui      # playwright UI mode
```

---

## Performance Patterns

```tsx
// Lazy load routes
const Dashboard = lazy(() => import('@/app/dashboard/page'))

// Memoize expensive renders
const ExpensiveList = memo(({ items }: { items: Item[] }) => (
  <ul>{items.map(i => <li key={i.id}>{i.name}</li>)}</ul>
))

// useCallback for stable function references passed to children
const handleSelect = useCallback((id: string) => {
  setSelectedId(id)
}, [])  // empty deps = stable reference

// useMemo for expensive computations
const sortedItems = useMemo(
  () => [...items].sort((a, b) => a.name.localeCompare(b.name)),
  [items]
)
```

---

## Environment Variables

```bash
# .env.local  (local dev, never commit)
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_ENV=development
NPM_PRIVATE_TOKEN=npm_xxxxxxxxxxxx

# .env.example  (committed, no values)
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_APP_ENV=
NPM_PRIVATE_TOKEN=
```

Rules:
- `NEXT_PUBLIC_` prefix = exposed to browser
- All others = server-only
- Access via `process.env.MY_VAR` — never `import.meta.env` in Next.js

---

## ESLint Config

```json
// .eslintrc.json
{
  "extends": [
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended-type-checked",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/consistent-type-imports": ["error", { "prefer": "type-imports" }],
    "react/self-closing-comp": "error",
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  }
}
```

---

## Agent Instructions

When working on React tasks:

1. **Check `.npmrc`** before installing — if `@company:` scoped packages exist, the private registry is in use.
2. **Always TypeScript** — never create `.js` or `.jsx` files in a TypeScript project.
3. **Named exports only** — no `export default`.
4. **Co-locate tests** with components (`Component.test.tsx` next to `Component.tsx`).
5. **Run lint and type-check** after changes: `pnpm lint && pnpm tsc --noEmit`
6. **Never mutate state directly** — use setState, Zustand setters, or produce (immer).
7. **Server Components by default** in Next.js App Router — add `'use client'` only when needed (event handlers, hooks, browser APIs).
8. **Validate forms with Zod** — share the schema between frontend and backend.
9. **Use `cn()` for className merging** — never string concatenation.
10. When adding a new feature, check if `@company/design-system` already has the component before building from scratch.
