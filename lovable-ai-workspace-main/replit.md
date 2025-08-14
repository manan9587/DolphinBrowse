# AgentBrowse - Automated Web Browser Agent

## Overview

AgentBrowse is a web-based automation platform that enables users to create AI-powered browser agents to perform web tasks. The application features a React frontend with a Node.js/Express backend and a Python automation engine powered by Playwright. Users can describe tasks in natural language, and the AI agent will navigate websites and perform actions automatically while providing real-time feedback through a browser viewport and activity logs.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **React 18** with TypeScript for type safety and modern development
- **Vite** as the build tool for fast development and optimized builds
- **Tailwind CSS** with shadcn/ui components for consistent design system
- **Wouter** for lightweight client-side routing
- **TanStack Query** for server state management and API caching
- **WebSocket integration** for real-time updates from browser automation sessions

### Backend Architecture
- **Express.js** server with TypeScript for API endpoints and WebSocket handling
- **In-memory storage** as the primary data layer with interfaces for future database migration
- **Session-based architecture** where each automation task creates a trackable session
- **WebSocket server** for broadcasting real-time updates to connected clients
- **Modular route handlers** organized by feature (auth, payments, admin, sessions)

### Database & ORM
- **Drizzle ORM** configured for PostgreSQL with schema definitions in TypeScript
- **Database schema** includes users, sessions, activity logs, usage tracking, and payments
- **Migration system** using Drizzle Kit for schema evolution
- Currently using in-memory storage with interfaces designed for easy database migration

### Authentication System
- **Firebase Authentication** for user management and social login
- **Google OAuth** integration for seamless user onboarding
- **JWT token verification** on the backend for API security
- **Role-based access control** with admin user support

### Browser Automation Engine
- **Python FastAPI** backend handling browser automation requests
- **Playwright** for cross-browser automation capabilities
- **Multi-AI model support** (GPT-4, Claude, Gemini) for task interpretation
- **Real-time viewport streaming** showing live browser state to users
- **Session management** with pause/resume functionality

### Payment Integration
- **Razorpay** payment gateway for subscription management
- **Trial system** with usage tracking and limits
- **Premium tier** with expanded automation capabilities

### Real-time Communication
- **WebSocket connections** for live activity logs and status updates
- **Session-based broadcasting** ensuring users only receive relevant updates
- **Auto-reconnection** handling for robust real-time experience

### Development & Deployment
- **Monorepo structure** with client, server, and shared code organization
- **ESM modules** throughout the codebase for modern JavaScript
- **TypeScript configuration** with path mapping for clean imports
- **Vite development server** with middleware integration for full-stack development

## External Dependencies

### Core Framework Dependencies
- **React ecosystem**: React 18, React DOM, React Router (Wouter)
- **Backend framework**: Express.js with TypeScript support
- **Build tools**: Vite, ESBuild for production builds
- **Database**: Drizzle ORM with PostgreSQL driver (@neondatabase/serverless)

### UI & Styling
- **Component library**: Radix UI primitives for accessible components
- **Styling**: Tailwind CSS with custom design system
- **Icons**: Lucide React for consistent iconography
- **Form handling**: React Hook Form with Zod validation

### Authentication & Payments
- **Firebase**: Authentication, user management
- **Razorpay**: Payment processing and subscription management
- **SendGrid**: Email service for notifications and user communication

### Automation & AI
- **Python FastAPI**: Browser automation backend
- **Playwright**: Cross-browser automation library
- **Multiple AI APIs**: OpenAI GPT-4, Anthropic Claude, Google Gemini

### State Management & Data Fetching
- **TanStack Query**: Server state management and caching
- **WebSocket**: Real-time communication between client and server
- **Session storage**: For maintaining user state and preferences

### Development Tools
- **TypeScript**: Type safety across the entire stack
- **ESLint/Prettier**: Code formatting and linting
- **PostCSS**: CSS processing and optimization
- **Replit integration**: Development environment optimization