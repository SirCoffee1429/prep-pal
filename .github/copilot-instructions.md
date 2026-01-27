# Copilot Instructions for Prep Pal

## Project Overview

Prep Pal is a kitchen prep management application built with React, TypeScript, Vite, and Supabase. It helps restaurant and kitchen staff manage food preparation tasks, recipes, menu items, and PAR (Periodic Automatic Replenishment) levels.

## Tech Stack

- **Frontend**: React 18 with TypeScript
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: TanStack React Query
- **Routing**: React Router DOM v6
- **Backend**: Supabase (PostgreSQL, Edge Functions)
- **Package Manager**: npm

## Project Structure

```
├── src/
│   ├── components/
│   │   ├── ui/          # shadcn/ui components
│   │   ├── admin/       # Admin dashboard components
│   │   └── prep/        # Prep dashboard components
│   ├── hooks/           # Custom React hooks
│   ├── integrations/    # Supabase client and types
│   ├── lib/             # Utility functions
│   └── pages/           # Route page components
├── supabase/
│   ├── functions/       # Supabase Edge Functions
│   └── migrations/      # Database migrations
├── public/              # Static assets
└── index.html           # Entry HTML file
```

## Development Commands

Always run these commands from the project root directory:

```bash
# Install dependencies (required before first run)
npm install

# Start development server (runs on port 8080)
npm run dev

# Build for production
npm run build

# Build for development environment
npm run build:dev

# Run ESLint
npm run lint

# Preview production build
npm run preview
```

## Key Conventions

### TypeScript

- Use TypeScript for all new files
- Path alias `@/` maps to `./src/`
- Component files use `.tsx` extension
- Utility files use `.ts` extension

### React Components

- Use functional components with hooks
- Use TanStack React Query for data fetching
- Follow shadcn/ui patterns for UI components
- Place reusable UI components in `src/components/ui/`
- Place feature-specific components in their respective folders under `src/components/`

### Styling

- Use Tailwind CSS utility classes
- Follow shadcn/ui theming conventions
- CSS variables are defined in `src/index.css`
- Use the `cn()` utility from `@/lib/utils` for conditional class names

### Supabase Integration

- Supabase client is configured in `src/integrations/supabase/client.ts`
- Database types are in `src/integrations/supabase/types.ts`
- Edge Functions are in `supabase/functions/`
- Database migrations are in `supabase/migrations/`

## Routes

- `/` - Landing page
- `/admin/login` - Admin login
- `/admin` - Admin dashboard (menu items, recipes, PAR management)
- `/prep` - Prep dashboard for kitchen staff

## Important Files

- `vite.config.ts` - Vite configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `components.json` - shadcn/ui configuration
- `tsconfig.json` - TypeScript configuration
- `eslint.config.js` - ESLint configuration

## Known Issues

- Some lint warnings exist for React Hook dependencies (pre-existing)
- Build produces a large bundle warning (>500KB) - consider code splitting for optimization

## Environment Variables

Environment variables should be configured in `.env` file (not committed to repo). Required variables for Supabase connection are managed through the Supabase integration.
