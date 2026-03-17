# Il Mio Ricettario

> A modern, privacy-first digital recipe book with AI-powered PDF extraction

Designed for home cooks who want to digitize their recipe collections without compromising on simplicity and speed.

![License](https://img.shields.io/badge/license-AGPL--3.0-blue)
![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)
![Firebase](https://img.shields.io/badge/Firebase-10.7-orange)

---

## Table of Contents

- [About the Project](#about-the-project)
- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Tech Stack](#tech-stack)
- [Architecture & Design Decisions](#architecture--design-decisions)
- [Development](#development)
- [Deployment](#deployment)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)
- [License](#license)
- [Support](#support)

---

## About the Project

**Il Mio Ricettario** (My Recipe Book) is a full-stack web application that helps home cooks digitize and organize their recipe collections. Built with Next.js and powered by Claude AI, it offers intelligent PDF recipe extraction, making it effortless to convert physical cookbooks or PDF recipe collections into a searchable, organized digital format.

### What Makes It Different

- **Text-Focused Design**: No image uploads required. Focus on what matters while cooking: ingredients, steps, and techniques.
- **Privacy-First Architecture**: Your recipes, your data. All data is stored in your own Firebase account with owner-based security rules.
- **AI-Powered**: Upload PDFs, paste free text, or chat with an AI chef to get new recipe suggestions — all with intelligent categorization and seasonal classification.
- **Cooking-Optimized**: Screen wake lock, progress tracking, and mobile-first design make it perfect for actual kitchen use.
- **Open Source**: AGPL-3.0 licensed to ensure the project and its improvements remain open and available to everyone.

### Design Philosophy

> Clean, text-based interface optimized for actual cooking use. Focus on content (ingredients, steps, techniques) over visual aesthetics. Your recipes, your data, your device.

This project deliberately avoids image-heavy interfaces common in recipe apps. Instead, it prioritizes speed, clarity, and functionality—exactly what you need when you're cooking.

---

## Features

### Core Recipe Management

- **Complete CRUD Operations**: Create, read, update, and delete recipes with full metadata support
- **Sectioned Organization**: Organize ingredients and steps into sections (e.g., "For the dough", "For the filling")
- **Rich Metadata**: Track servings, prep time, cook time, difficulty level, and seasonal availability
- **Smart Categorization**: Organize recipes with customizable categories and subcategories, each with emoji and color
- **Recipe Search**: Fast, real-time search by recipe name with full Italian character support (à, è, ì, ò, ù)
- **Multiple Seasons**: Assign multiple seasons to recipes (e.g., Pasta e Fagioli for both autumn and winter)
- **Advanced Filtering**: Filter recipes by category, subcategory, and season simultaneously with live count updates

<img width="1884" height="777" alt="image" src="https://github.com/user-attachments/assets/fa9cc1bd-f032-408a-9233-a1dd9e700dd8" />


### Secure Authentication

- **Email/Password Authentication**: Standard email-based registration and login
- **Google OAuth Integration**: Quick sign-in with Google accounts
- **Firebase Auth**: Industry-standard authentication with automatic session management
- **User Data Isolation**: Every user's recipes are completely isolated with owner-based security rules

### Cooking Mode

<img width="1617" height="883" alt="image" src="https://github.com/user-attachments/assets/19cace0e-cd22-4723-8252-94525cd3c205" />


- **Screen Wake Lock**: Uses nosleep.js to prevent your device from going to sleep while cooking
- **Interactive Checkboxes**: Check off ingredients and steps as you complete them
- **Progress Tracking**: Visual progress bar shows completion percentage
- **Persistent Sessions**: Close the app and come back later—your progress is automatically saved
- **Serving Size Scaling**: Select different serving sizes and ingredient quantities adjust automatically
- **Italian Decimal Format**: Properly formatted quantities (e.g., "1,5 kg" instead of "1.5 kg")
- **Auto-Cleanup**: Completed cooking sessions (100% progress) are automatically deleted

### Active Cooking Sessions Dashboard

- **Centralized View**: See all your in-progress cooking sessions in one place
- **Quick Resume**: Jump back into any active cooking session with one click
- **Progress At-A-Glance**: See how far you've progressed in each recipe
- **Real-Time Updates**: Session progress updates instantly across all devices

### AI Assistant (Assistente Ricette AI)

<img width="1162" height="761" alt="image" src="https://github.com/user-attachments/assets/ada5b7e2-a646-49c9-a8d2-b4ef5d8e7457" />


Three ways to get recipes in — all powered by Claude AI:

**PDF Extraction:**
- **Automatic Recipe Extraction**: Upload PDF cookbooks and Claude AI extracts all recipes automatically
- **Multi-Page Support**: Processes entire PDF documents, extracting every recipe found
- Maximum file size: 4.4MB (Vercel request body limit)

**Free-Text Formatting:**
- **Type or paste any recipe**: Write rough notes, copy from a website, or dictate informally
- **Claude reformats it**: Structures ingredients, steps, sections, and metadata automatically
- No file required — just text

**AI Chat Recipe Generation (new):**
- **Ask the AI chef**: Describe ingredients you have, request a cuisine style, or ask for something new
- **Cookbook-aware**: The AI knows your existing recipes and avoids suggesting duplicates
- **Multi-turn**: Refine suggestions with follow-up messages ("make it lighter", "add more vegetables")
- Generated recipes appear as preview cards, ready to save with one click

**All modes share:**
- **Structure Preservation**: Maintains the original organization of ingredients and steps
- **Intelligent Categorization**: AI suggests appropriate categories (using existing ones or proposing new ones)
- **Seasonal Classification**: Analyzes ingredients against an Italian seasonal ingredient database
- **Smart Normalization**: Converts times to minutes, capitalizes section headers, standardizes formatting
- **Editable Preview**: Review and modify all recipes before saving
- **Transparency**: Recipes and categories suggested by AI are clearly marked with badges

**Technical Details**:
- Powered by Claude Sonnet 4.6 (200K token context window)
- Native PDF support with base64 encoding
- Endpoints: `/api/extract-recipes` (PDF), `/api/format-recipe` (text), `/api/chat-recipe` (chat)

**Italian Seasonal Ingredient Database**:
- **Primavera (Spring)**: Asparagus, artichokes, fava beans, peas, strawberries
- **Estate (Summer)**: Tomatoes, eggplant, zucchini, basil, peaches
- **Autunno (Autumn)**: Pumpkin, mushrooms, chestnuts, radicchio
- **Inverno (Winter)**: Black cabbage, citrus, turnip greens, fennel
- **Tutte le stagioni (All seasons)**: For recipes without strong seasonal ingredients

### Weekly Meal Planner

Plan your meals for the week — AI-assisted or fully manual.

- **AI-generated plans**: The AI selects recipes from your cookbook and optionally creates new ones tailored to the season
- **Manual mode**: Start with an empty grid and fill each slot by picking from your cookbook
- **Per-meal control**: Set how many new AI-generated recipes to include for each meal type (breakfast, lunch, dinner)
- **Category hints**: Tell the AI which category to prefer for each meal type
- **Edit after generation**: Click any slot to swap the recipe at any time
- **Save AI recipes**: Newly generated recipes (shown in purple) can be saved to your cookbook in one click — with AI-suggested category and seasons pre-filled
- **Quick navigation**: Green cells link directly to the full recipe page
- **Persistent**: Plans are saved to Firebase and restored automatically on your next visit

### Mobile-First Responsive Design

<img width="373" height="829" alt="image" src="https://github.com/user-attachments/assets/0b0bd5b9-97dd-49be-b784-1cc0b0c81eb4" />
<img width="918" height="415" alt="image" src="https://github.com/user-attachments/assets/596c4e03-4001-47cd-a566-04768c7b4f8b" />



- **Orientation-Aware Navigation**:
  - **Desktop (≥ 1440px)**: Persistent sidebar navigation always visible
  - **Mobile Portrait**: Bottom navigation bar with 4 main tabs + "More" sheet
  - **Mobile Landscape**: Hamburger menu with slide-out sidebar
- **Custom 1440px Breakpoint**: Optimized for tablets to use mobile UI (better for cooking)
- **Touch-Friendly**: Large tap targets, swipe gestures, and mobile-optimized interactions
- **Responsive Tables**: Ingredient and step lists adapt gracefully to all screen sizes
- **Apple Home Screen Icon**: Custom icon when adding the app to iOS/iPad home screen

---

## Quick Start

Get up and running in less than 5 minutes.

### Prerequisites

- **Node.js 18+** and npm
- **Firebase account** (free tier works perfectly)
- **Anthropic API key** (for AI features—free trial available)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/GiuseppeDM98/il-mio-ricettario.git
cd il-mio-ricettario

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env.local
# Edit .env.local with your Firebase config and Anthropic API key

# 4. Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. You should see the login page.

**Note**: For full functionality, you'll need to complete the Firebase setup (see [Installation](#installation) below).

---

## Installation

Complete setup guide for local development.

### System Requirements

- **Node.js**: 18.0.0 or higher
- **npm**: 9.0.0 or higher (or yarn 1.22.0+)
- **Modern Browser**: Chrome 90+, Firefox 88+, Safari 14+, or Edge 90+
- **Git**: For cloning the repository

### Step 1: Firebase Project Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or "Create a project"
3. Enter project name (e.g., "my-recipe-book")
4. (Optional) Enable Google Analytics
5. Click "Create project" and wait for initialization

**Verification**: You should see the Firebase project dashboard

### Step 2: Enable Authentication

1. In the Firebase Console sidebar, click **Authentication**
2. Click "Get started"
3. Go to the "Sign-in method" tab

**Enable Email/Password**:
1. Click "Email/Password"
2. Toggle the first switch to "Enabled"
3. Click "Save"

**Enable Google Sign-In**:
1. Click "Google"
2. Toggle to "Enabled"
3. Select a project support email
4. Click "Save"

**Verification**: Both "Email/Password" and "Google" should show "Enabled" status

### Step 3: Create Firestore Database

1. In the sidebar, click **Firestore Database**
2. Click "Create database"
3. **Security rules**: Select "Start in production mode" (we'll deploy custom rules next)
4. **Location**: Choose the closest region to your users
   - Europe: `eur3` (Belgium)
   - US: `us-central` (Iowa)
   - Asia: `asia-southeast1` (Singapore)
   - **Important**: This cannot be changed later!
5. Click "Enable"

**Verification**: Empty Firestore console should appear

### Step 4: Deploy Firestore Security Rules

The project includes owner-based security rules that ensure users can only access their own data.

```bash
# Install Firebase CLI globally (if not already installed)
npm install -g firebase-tools

# Login to Firebase
firebase login

# Link your local project to your Firebase project
firebase use --add
# Select your project from the list
# Use "default" as the alias

# Deploy the security rules
firebase deploy --only firestore:rules
```

**Expected Output**:
```
=== Deploying to 'your-project-name'...

i  deploying firestore
✔  firestore: released rules firestore.rules to cloud.firestore

✔  Deploy complete!
```

**Verification**:
- In Firebase Console, go to **Firestore Database** → **Rules** tab
- You should see the deployed rules with `isAuthenticated()` and `isOwner()` functions

### Step 5: Get Firebase Configuration

1. In Firebase Console, click the gear icon ⚙️ → **Project settings**
2. Scroll down to "Your apps" section
3. If you don't have a web app yet:
   - Click the web icon `</>`
   - App nickname: "Il Mio Ricettario Web"
   - Don't check "Firebase Hosting"
   - Click "Register app"
4. Copy the `firebaseConfig` object:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyC...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};
```

**Save these values**—you'll need them for the next step.

### Step 6: Get Anthropic API Key

1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to **API Keys** section
4. Click "Create Key"
5. Name: "Il Mio Ricettario"
6. Copy the API key (format: `sk-ant-api03-...`)

**Important**:
- The key is only shown once—save it securely
- New accounts get $5 in free credits
- Approximate cost: $0.05-$0.15 per PDF (10-20 recipes)

### Step 7: Configure Environment Variables

Create `.env.local` file in the project root:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:

```env
# Firebase Configuration (all 6 values from Step 5)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Anthropic AI Configuration (from Step 6)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Optional: Toggle user registrations
NEXT_PUBLIC_REGISTRATIONS_ENABLED=true
```

**Environment Variable Reference**:

| Variable | Required | Scope | Description |
|----------|----------|-------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes | Client+Server | Firebase Web API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes | Client+Server | Firebase authentication domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes | Client+Server | Firebase project identifier |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Yes | Client+Server | Cloud Storage bucket URL |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Yes | Client+Server | Firebase Cloud Messaging sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Yes | Client+Server | Firebase app identifier |
| `ANTHROPIC_API_KEY` | Yes* | **Server Only** | Claude API key for PDF extraction |
| `NEXT_PUBLIC_REGISTRATIONS_ENABLED` | No | Client+Server | Enable/disable new user registrations |

\* Required for AI features. The app works without it for manual recipe entry.

**Security Note**:
- Variables with `NEXT_PUBLIC_` prefix are exposed to the browser
- `ANTHROPIC_API_KEY` does NOT have this prefix—it's server-only for security

### Step 8: Run the Application

```bash
# Start the development server
npm run dev
```

The application will start at [http://localhost:3000](http://localhost:3000)

**Test the Installation**:
1. Open http://localhost:3000
2. Register a new account
3. Create a test recipe manually
4. (Optional) Test PDF extraction with a small PDF file

---

## Tech Stack

### Frontend

- **[Next.js 16.1.6](https://nextjs.org/)** - React framework with App Router
  - Server and client components
  - File-based routing
  - API routes for backend functionality
  - Standalone output mode for optimized deployment

- **[React 18.2](https://react.dev/)** - UI library
  - Concurrent features for better performance
  - Hooks for state management
  - Server components support

- **[TypeScript 5.3](https://www.typescriptlang.org/)** - Static type checking
  - Strict mode enabled
  - Full type safety across the codebase
  - Enhanced developer experience with IntelliSense

- **[Tailwind CSS 3.4](https://tailwindcss.com/)** - Utility-first CSS framework
  - Custom HSL design system
  - Responsive breakpoints (custom 1440px `lg` breakpoint)
  - Mobile-first approach

### UI Components

- **[Radix UI](https://www.radix-ui.com/)** - Accessible component primitives
  - Dialog, Toast, Sheet components
  - Unstyled and accessible by default
  - WAI-ARIA compliant

- **[Lucide React](https://lucide.dev/)** - Icon library
  - 500+ consistent icons
  - Tree-shakeable for optimal bundle size
  - Customizable size and color

- **[class-variance-authority](https://cva.style/)** - Type-safe component variants
  - Consistent component API
  - TypeScript autocompletion
  - Better DX for component styling

### Backend & Services

- **[Firebase Auth 10.7](https://firebase.google.com/docs/auth)** - Authentication
  - Email/password authentication
  - Google OAuth provider
  - Session management
  - Secure token refresh

- **[Cloud Firestore 10.7](https://firebase.google.com/docs/firestore)** - NoSQL database
  - Real-time synchronization
  - Offline support
  - Powerful querying
  - Automatic scaling

- **[Anthropic Claude API](https://www.anthropic.com/api)** - AI-powered features
  - Claude Sonnet 4.5 model
  - 200K token context window
  - Native PDF support
  - Vision capabilities for document analysis

### Key Libraries

- **[nosleep.js 0.12](https://github.com/richtr/NoSleep.js/)** - Screen wake lock
  - Prevents device sleep during cooking mode
  - Cross-browser compatible
  - No permissions required

- **[uuid 9.0](https://github.com/uuidjs/uuid)** - Unique ID generation
  - v4 (random) UUIDs for ingredients and steps
  - RFC4122 compliant

- **[react-hot-toast 2.6](https://react-hot-toast.com/)** - Toast notifications
  - Beautiful, customizable toasts
  - Promise-based API
  - Keyboard accessible

- **[zod 4.1](https://zod.dev/)** - Runtime type validation
  - TypeScript-first schema validation
  - Type inference
  - Error messages

### Development Tools

- **[Jest 30.2](https://jestjs.io/)** - Testing framework
  - Unit and integration tests
  - Snapshot testing
  - Coverage reporting

- **[@testing-library/react 16.3](https://testing-library.com/react)** - Testing utilities
  - User-centric testing approach
  - Best practices encouraged
  - Accessible queries

- **[ESLint 8.x](https://eslint.org/)** - Code linting
  - Next.js recommended rules
  - Catches common errors
  - Enforces code style

### Security

- **Package Overrides** (via package.json):
  - `glob >= 10.4.6` - Fixes security vulnerabilities
  - `undici >= 6.21.2` - Patches HTTP client vulnerabilities

---

## Architecture & Design Decisions

Understanding the "why" behind key technical choices.

### Project Structure

```
src/
├── app/
│   ├── (auth)/              # Public authentication routes
│   │   ├── login/           # Login page
│   │   └── register/        # Registration page
│   ├── (dashboard)/         # Protected application routes
│   │   ├── ricette/         # Recipe list, detail, edit, cooking mode
│   │   │   ├── [id]/        # Dynamic recipe routes
│   │   │   │   ├── edit/    # Edit recipe page
│   │   │   │   └── cooking/ # Cooking mode
│   │   │   └── new/         # Create recipe page
│   │   ├── categorie/       # Category management
│   │   ├── cotture-in-corso/ # Active cooking sessions dashboard
│   │   └── assistente-ai/    # AI Assistant (PDF, free-text, chat)
│   └── api/                 # Server-side API routes
│       ├── extract-recipes/ # PDF extraction endpoint
│       └── suggest-category/ # AI categorization endpoint
├── components/
│   ├── ui/                  # Base UI components (Button, Card, Input, etc.)
│   ├── recipe/              # Recipe-specific components
│   │   ├── recipe-form.tsx
│   │   ├── recipe-card.tsx
│   │   ├── ingredient-list.tsx
│   │   └── steps-list.tsx
│   ├── auth/                # Authentication components
│   │   ├── auth-form.tsx
│   │   └── protected-route.tsx
│   └── layout/              # Layout components
│       ├── header.tsx
│       ├── sidebar.tsx
│       ├── bottom-navigation.tsx
│       └── more-sheet.tsx
├── lib/
│   ├── firebase/            # Firebase service layer
│   │   ├── config.ts        # Firebase initialization (singleton)
│   │   ├── auth.ts          # Auth helpers
│   │   ├── firestore.ts     # Firestore CRUD operations
│   │   ├── categories.ts    # Category management
│   │   └── cooking-sessions.ts # Session management
│   ├── hooks/               # Custom React hooks
│   │   ├── useAuth.ts       # Authentication hook
│   │   └── useRecipes.ts    # Recipe data fetching
│   ├── context/             # React context providers
│   │   └── AuthContext.tsx  # Global auth state
│   └── utils/               # Utility functions
│       ├── recipe-parser.ts # Markdown → Recipe parser
│       └── ingredient-scaler.ts # Quantity scaling logic
└── types/
    └── index.ts             # TypeScript type definitions
```

### Key Architectural Decisions

#### 1. Standalone Next.js Build

**Decision**: Use `output: 'standalone'` in Next.js configuration

**Why**:
- Creates a self-contained build with all dependencies bundled
- Optimized for deployment to Vercel, Docker, or any Node.js environment
- Significantly smaller bundle size compared to default output
- Faster cold starts in serverless environments

**Trade-off**:
- Cannot use static export features (but we prioritize dynamic API routes)

**Benefit**:
- 40-50% reduction in deployment size
- Better performance in production

---

#### 2. Owner-Based Security Model

**Decision**: Every Firestore document has a `userId` field, enforced by security rules

**Why**:
- Multi-tenant architecture: One Firestore database serves all users
- Strong data isolation: Users can only access their own data
- GDPR-friendly: Clear data ownership and easy user deletion
- Cost-effective: No need for separate database instances

**Implementation**:
```javascript
// Firestore security rules
match /recipes/{recipeId} {
  allow read, update, delete: if isOwner(resource.data.userId);
  allow create: if isAuthenticated() && request.resource.data.userId == request.auth.uid;
}
```

**Alternative Considered**:
- Separate Firestore projects per user (rejected: cost prohibitive, complex management)

**Benefit**:
- Bulletproof privacy
- Scales to millions of users on free tier
- Easy to audit and verify security

---

#### 3. Sectioned Data Model (Flat Arrays)

**Decision**: Use flat arrays with `section` field instead of nested objects

**Why**:
- Firestore has limitations with deeply nested queries
- Easier to filter and sort (e.g., "show only ingredients in section X")
- Simpler to scale quantities across all ingredients
- Better performance for large recipes

**Data Structure**:
```typescript
ingredients: [
  { id: "1", name: "Flour", quantity: "500g", section: "For the dough" },
  { id: "2", name: "Eggs", quantity: "2", section: "For the dough" },
  { id: "3", name: "Tomato sauce", quantity: "200ml", section: "For the filling" }
]
```

**Alternative Considered**:
```typescript
// Rejected: Nested structure
sections: {
  "For the dough": {
    ingredients: [...]
  }
}
```

**Benefit**:
- Firestore queries work smoothly
- Easy to reorder sections
- Compatible with array operators

---

#### 4. API Routes for AI (Server-Side Only)

**Decision**: Keep AI functionality in Next.js API routes, not client-side

**Why**:
- **Security**: Anthropic API key never exposed to browser
- **Cost Control**: All API calls logged and rate-limited server-side
- **Consistency**: Same AI model and prompt for all users
- **Error Handling**: Better error messages and retry logic

**Implementation**:
```typescript
// src/app/api/extract-recipes/route.ts
// ANTHROPIC_API_KEY is server-only (no NEXT_PUBLIC_ prefix)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});
```

**Alternative Considered**:
- Client-side AI calls (rejected: security risk, no cost control)

**Benefit**:
- Zero risk of API key leakage
- Can implement sophisticated rate limiting
- Centralized logging and monitoring

---

#### 5. Setup Screen Pattern (Cooking Sessions)

**Decision**: Use a setup screen to select servings before entering cooking mode

**Why**:
- Prevents duplicate session creation (common bug with useEffect-based approaches)
- Explicit user intent: User consciously starts cooking
- Opportunity to configure (serving size selection)
- Cleaner state management

**Flow**:
```
Recipe Detail → Click "Start Cooking" → Setup Screen (select servings)
→ Create Session → Cooking Mode
```

**Alternative Rejected**:
```typescript
// Anti-pattern: useEffect automatically creates session
useEffect(() => {
  if (!session) {
    createCookingSession(recipeId);
  }
}, [recipeId]);
```
**Problem**: Creates multiple sessions on re-renders, race conditions

**Benefit**:
- Reliable session creation (one session per cooking attempt)
- Better UX: user has control
- Easier to test

---

#### 6. 1440px Breakpoint (Non-Standard)

**Decision**: Use 1440px as the `lg` breakpoint instead of standard 1024px

**Why**:
- **Standard breakpoints**: 1024px typically separates tablet from desktop
- **Our use case**: Tablets (like iPad at 1024px) are better served by mobile UI while cooking
- **Rationale**:
  - Mobile UI has bottom navigation (easier to reach with messy hands)
  - Sidebar navigation requires cleaner hands and more precision
  - 1440px better separates "actual desktop" from "tablet/laptop"

**Implementation**:
```javascript
// tailwind.config.ts
module.exports = {
  theme: {
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1440px',  // Custom: Higher than standard 1024px
      xl: '1536px',
    }
  }
}
```

**Mobile-Specific Styles**:
```typescript
// Use max-lg:portrait: not just portrait:
className="max-lg:portrait:block hidden"
```

**Benefit**:
- Better experience on tablets
- More users get the optimized cooking UI
- Desktop users get full sidebar experience

---

#### 7. AGPL-3.0 License

**Decision**: Use AGPL-3.0 instead of MIT or Apache 2.0

**Why**:
- **Strong Copyleft**: Ensures modifications remain open source
- **Network Use = Distribution**: If you host this as a SaaS, you must provide source to users
- **Community Protection**: Prevents proprietary forks that don't give back
- **Philosophical Alignment**: Recipe knowledge should be shared freely

**Implications**:
- Commercial use allowed
- Modifications allowed
- But: Must publish modifications if you host publicly
- SaaS deployments must provide source code access

**Alternative Considered**:
- MIT License (rejected: too permissive, allows proprietary forks)

**Benefit**:
- Guarantees project stays open forever
- Encourages community contributions
- Aligns with values of food and recipe sharing

---

### Data Flow Diagrams

**Recipe CRUD Flow**:
```
User Action (Create/Edit)
    ↓
Component (RecipeForm)
    ↓
Firebase Service Layer (firestore.ts)
    ↓
Cloud Firestore (Firebase)
    ↓
Security Rules Enforcement
    ↓
Database Persistence
    ↓
Real-time Update to UI
```

**AI Extraction Flow**:
```
User Uploads PDF
    ↓
Client Validation (size, type)
    ↓
POST /api/extract-recipes
    ↓
Server reads file, converts to base64
    ↓
Claude API call (Sonnet 4.5)
    ↓
Markdown response
    ↓
Parser (recipe-parser.ts)
    ↓
Structured recipe objects
    ↓
Preview component (editable)
    ↓
User saves → Firestore
```

**Cooking Mode Flow**:
```
Recipe Detail Page
    ↓
User clicks "Start Cooking"
    ↓
Setup Screen (select servings)
    ↓
Create Cooking Session (Firestore)
    ↓
Cooking UI (checkboxes, wake lock)
    ↓
Checkbox changes → Auto-save to Firestore
    ↓
100% complete → Auto-delete session
```

---

## Development

Guide for developers working on the codebase.

### Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| **Development** | `npm run dev` | Start Next.js development server on port 3000 with hot reload |
| **Build** | `npm run build` | Create production build (standalone mode) |
| **Start** | `npm run start` | Start production server (requires build first) |
| **Export** | `npm run export` | Build and export static site for Firebase Hosting |
| **Test** | `npm run test` | Run Jest test suite |
| **Lint** | `npm run lint` | Run ESLint checks |

### Coding Conventions

#### TypeScript

- **Type Definitions**: All types are centralized in `src/types/index.ts`
- **Interfaces vs Types**:
  - Use `interface` for domain models (e.g., `Recipe`, `Category`)
  - Use `type` for utility types (e.g., type aliases, unions)
- **Strict Mode**: Always enabled—no `any` types allowed
  - Use `unknown` if type is truly unknown, then narrow with type guards
- **Export Pattern**: Named exports preferred over default exports

**Example**:
```typescript
// src/types/index.ts
export interface Recipe {
  id: string;
  userId: string;
  title: string;
  ingredients: Ingredient[];
  steps: Step[];
  // ...
}

// Good
import { Recipe } from '@/types';

// Avoid
import Recipe from '@/types';
```

#### React Patterns

- **Client Components**: All page components use `'use client'` directive
- **Server Components**: Only API routes are server-side
- **Hooks**: Custom hooks in `src/lib/hooks/`, prefixed with `use`
- **Context**: Global state in `src/lib/context/`, minimal usage

**Example**:
```typescript
// Page component
'use client';

import { useAuth } from '@/lib/hooks/useAuth';

export default function RecipesPage() {
  const { user } = useAuth();
  // ...
}
```

#### Firebase Best Practices

**Critical Rule**: Use `null` for optional fields, never `undefined`

**Why**: Firestore doesn't store `undefined` values, leading to inconsistencies

```typescript
// ✅ Good
const recipe = {
  categoryId: selectedCategory?.id || null,
  prepTime: prepTimeValue || null
};

// ❌ Bad - undefined fields won't be saved
const recipe = {
  categoryId: selectedCategory?.id,
  prepTime: prepTimeValue
};
```

**Query Pattern**: Always filter by `userId`

```typescript
// ✅ Good
const recipesRef = collection(db, 'recipes');
const q = query(recipesRef, where('userId', '==', userId));

// ❌ Bad - returns all users' recipes
const q = query(recipesRef);
```

**Timestamps**: Use `serverTimestamp()` for consistency

```typescript
import { serverTimestamp } from 'firebase/firestore';

const recipe = {
  // ...
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp()
};
```

#### Styling Guidelines

- **Tailwind Only**: No custom CSS files (except global.css for base styles)
- **Semantic Tokens**: Use design system variables
  - `bg-primary`, `text-primary`, `border-primary`
  - `bg-secondary`, `text-secondary`
  - `bg-muted`, `text-muted-foreground`
  - `bg-destructive`, `text-destructive-foreground`
- **Mobile-First**: Add breakpoints progressively
  - Base styles = mobile
  - `sm:` = 640px+
  - `md:` = 768px+
  - `lg:` = 1440px+
- **Responsive Navigation**: Use `max-lg:portrait:` for mobile-specific styles

```typescript
// ✅ Good - Mobile-first, semantic tokens
<button className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 sm:px-6 sm:py-3">
  Save Recipe
</button>

// ✅ Good - Orientation-specific
<nav className="max-lg:portrait:block max-lg:landscape:hidden lg:block">
  {/* Navigation content */}
</nav>

// ❌ Bad - Custom colors, desktop-first
<button className="bg-blue-600 text-white lg:hidden">
  Save
</button>
```

**Utility Function**: Use `cn()` for conditional classes

```typescript
import { cn } from '@/lib/utils';

<div className={cn(
  "base-class",
  isActive && "active-class",
  isDisabled && "disabled-class"
)}>
  Content
</div>
```

### Testing

#### Running Tests

```bash
# Run all tests
npm test

# Watch mode (re-runs on file changes)
npm test -- --watch

# Coverage report
npm test -- --coverage

# Run specific test file
npm test -- Header.test.tsx
```

#### Writing Tests

**Setup**: Tests use Jest + React Testing Library

**Example Test**:
```typescript
// src/components/layout/__tests__/Header.test.tsx
import { render, screen } from '@testing-library/react';
import Header from '../Header';

// Mock Firebase auth
jest.mock('@/lib/firebase/config', () => ({
  auth: {}
}));

// Mock auth hook
jest.mock('@/lib/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { uid: '123', email: 'test@example.com' },
    signOut: jest.fn()
  })
}));

describe('Header', () => {
  it('renders user email when authenticated', () => {
    render(<Header />);
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });
});
```

**Best Practices**:
- Mock external dependencies (Firebase, hooks)
- Test user interactions, not implementation details
- Use accessible queries (`getByRole`, `getByLabelText`)
- Follow Testing Library principles

### Debugging

#### Firebase Debug Mode

```typescript
// Enable detailed Firestore logs (development only)
import { setLogLevel } from 'firebase/firestore';

if (process.env.NODE_ENV === 'development') {
  setLogLevel('debug');
}
```

#### Common Issues & Solutions

**Issue**: "Firebase Auth not initialized"
- **Cause**: Missing environment variables
- **Solution**: Check `.env.local`, restart dev server

**Issue**: "Permission denied" in Firestore
- **Cause**: Security rules not deployed or query doesn't filter by `userId`
- **Solution**:
  ```bash
  firebase deploy --only firestore:rules
  ```
  Check query includes `where('userId', '==', userId)`

**Issue**: Module not found errors
- **Cause**: TypeScript path aliases not resolving
- **Solution**: Check `tsconfig.json` has correct paths configuration

**Issue**: Hydration mismatch warnings
- **Cause**: Browser-only code running on server
- **Solution**: Use `'use client'` directive or check for `typeof window !== 'undefined'`

---

## Deployment

Deploy Il Mio Ricettario to production. For detailed deployment instructions, see [SETUP.md](SETUP.md).

### Option 1: Vercel (Recommended)

**Best for**: Most users, especially those new to deployment

**Advantages**:
- Zero-configuration deployment
- Automatic HTTPS and global CDN
- Serverless functions for API routes (no server management)
- Environment variable management in dashboard
- Git integration (auto-deploy on push)
- Free tier: 100GB bandwidth/month, unlimited projects

**Limitations**:
- 4.4MB request body limit (affects maximum PDF size)
- 10-second serverless function timeout on free tier
- Vendor lock-in to Vercel platform

**Quick Deploy Steps**:
1. Push code to GitHub
2. Import project in [Vercel Dashboard](https://vercel.com/dashboard)
3. Add environment variables (Firebase + Anthropic)
4. Deploy
5. Add Vercel domain to Firebase authorized domains

**Full guide**: [SETUP.md](SETUP.md)

---

### Option 2: Firebase Hosting

**Best for**: Users who want everything on Firebase, or need static hosting

**Advantages**:
- Same provider as Firestore (single dashboard)
- Free tier: 10GB storage, 360MB/day transfer
- Custom domains with auto-SSL
- SPA-friendly hosting

**Limitations**:
- Static export only (no server-side rendering)
- API routes require Cloud Functions setup (not covered in basic setup)
- AI extraction features need extra configuration
- Build-time environment variables only

**Quick Deploy Steps**:
1. Change `next.config.js` to `output: 'export'`
2. Build: `npm run build`
3. Deploy: `firebase deploy --only hosting`

**Full guide**: [SETUP.md - Firebase Hosting](SETUP.md#firebase-hosting)

---

### Option 3: Docker (Self-Hosted)

**Best for**: Users who want full control or private infrastructure

**Advantages**:
- Complete control over infrastructure
- No vendor lock-in
- Can deploy anywhere (AWS, GCP, Azure, DigitalOcean, etc.)
- Customizable resource allocation

**Dockerfile**:
```dockerfile
FROM node:18-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Build application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["node", "server.js"]
```

**Build and Run**:
```bash
# Build image
docker build -t il-mio-ricettario .

# Run container
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_FIREBASE_API_KEY=your_key \
  -e ANTHROPIC_API_KEY=your_key \
  il-mio-ricettario
```

**Docker Compose**:
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env.local
    restart: unless-stopped
```

---

## Database Schema

Firestore collections and document structures.

### Collections Overview

- `users/{uid}` - User profiles
- `recipes/{id}` - Recipe documents
- `categories/{id}` - User-created categories
- `subcategories/{id}` - Subcategories nested under categories
- `cooking_sessions/{id}` - Active cooking progress tracking

### users/{uid}

User profile information.

```typescript
interface User {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  createdAt: Timestamp;
}
```

**Security**: Users can only read/update their own profile.

---

### recipes/{id}

Complete recipe documents with all data.

```typescript
interface Recipe {
  id: string;
  userId: string;              // Owner (required for security)
  title: string;

  ingredients: Ingredient[];   // Array of ingredient objects
  steps: Step[];               // Array of step objects

  servings: number;
  prepTime: number | null;     // Minutes
  cookTime: number | null;     // Minutes
  difficulty: string | null;   // "Facile", "Media", "Difficile"

  categoryId: string | null;
  subcategoryId: string | null;
  season: Season | null;       // Seasonal classification

  aiSuggested: boolean;        // True if AI-suggested during extraction

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface Ingredient {
  id: string;                  // UUID v4
  name: string;
  quantity: string;
  section: string | null;      // e.g., "Per la pasta", "Per il condimento"
}

interface Step {
  id: string;                  // UUID v4
  description: string;
  section: string | null;      // e.g., "Preparazione", "Cottura"
  sectionOrder: number;        // Preserves order from PDF extraction
}

type Season = 'primavera' | 'estate' | 'autunno' | 'inverno' | 'tutte_stagioni';
```

**Key Features**:
- `userId` field enforced by security rules
- `null` for optional fields (not `undefined`)
- Flat arrays with `section` field (not nested objects)
- `sectionOrder` preserves original structure from PDF
- `aiSuggested` flag for transparency

**Security**:
- Read/Write only by owner (`userId == request.auth.uid`)
- Create requires authenticated user and setting own `userId`

---

### categories/{id}

User-created recipe categories.

```typescript
interface Category {
  id: string;
  userId: string;
  name: string;
  emoji: string;               // e.g., "🍝", "🍰"
  color: string;               // Hex color, e.g., "#FF6B6B"
  createdAt: Timestamp;
}
```

**Default Categories**: New users get 10 default Italian categories:
- Antipasti (🥗), Primi Piatti (🍝), Secondi (🍖), Contorni (🥕)
- Dolci (🍰), Pane e Pizza (🍞), Salse e Condimenti (🧈)
- Conserve (🫙), Bevande (🍹), Altro (📋)

**Security**: Owner-only access

---

### subcategories/{id}

Optional subcategories nested under categories.

```typescript
interface Subcategory {
  id: string;
  userId: string;
  categoryId: string;          // Parent category
  name: string;
  createdAt: Timestamp;
}
```

**Example**:
- Category: "Primi Piatti"
- Subcategories: "Pasta", "Risotti", "Zuppe"

**Security**: Owner-only access

---

### cooking_sessions/{id}

Active cooking session with progress tracking.

```typescript
interface CookingSession {
  id: string;
  userId: string;
  recipeId: string;
  recipeTitle: string;

  servings: number;            // Selected serving size (may differ from recipe default)

  checkedIngredients: string[]; // Array of ingredient IDs
  checkedSteps: string[];       // Array of step IDs

  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Lifecycle**:
1. Created when user starts cooking mode
2. Updated when checkboxes are toggled
3. **Auto-deleted** when 100% complete (all ingredients + steps checked)

**Security**: Owner-only access

---

### Firestore Security Rules

All collections use owner-based access control:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }

    // Recipe collection
    match /recipes/{recipeId} {
      allow read, update, delete: if isOwner(resource.data.userId);
      allow create: if isAuthenticated()
                    && request.resource.data.userId == request.auth.uid;
    }

    // Categories, Subcategories, Cooking Sessions: same pattern
    // ...
  }
}
```

**Deployment**: Rules are deployed from `firebase/firestore.rules` via Firebase CLI

---

## API Reference

Server-side API endpoints for AI functionality.

### POST /api/extract-recipes

Extract recipes from PDF using Claude AI.

**Endpoint**: `POST /api/extract-recipes`

**Content-Type**: `multipart/form-data`

**Request**:
```http
POST /api/extract-recipes
Content-Type: multipart/form-data

Body:
  file: File (PDF, max 4.4MB)
```

**Response** (Success):
```json
{
  "success": true,
  "extractedRecipes": "# Pasta al Pomodoro\n\n## Ingredienti\n\n### Per la pasta\n- Pasta: 320g\n...",
  "metadata": {
    "pageCount": 5,
    "fileSize": 2048576
  }
}
```

**Response** (Error):
```json
{
  "success": false,
  "error": "File too large. Maximum size is 4.4MB."
}
```

**Error Codes**:
- `400`: No file provided
- `400`: Invalid file type (must be PDF)
- `413`: File too large (> 4.4MB)
- `500`: Claude API error
- `500`: Internal server error

**Implementation Details**:
- **Model**: Claude Sonnet 4.5 (claude-sonnet-4-5-20241022)
- **Context Window**: 200,000 tokens
- **Max Output**: 16,000 tokens
- **Vision**: Native PDF support (base64 encoding)
- **Prompt**: Italian-language extraction with detailed instructions
- **Rate Limiting**: Server-side (via Anthropic API limits)

**Performance**:
- Small PDF (1-5 recipes, < 1MB): 15-30 seconds
- Medium PDF (10-20 recipes, 2-3MB): 45-90 seconds
- Large PDF (20+ recipes, 3-4MB): 90-180 seconds

---

### POST /api/suggest-category

AI suggests category and season for a recipe.

**Endpoint**: `POST /api/suggest-category`

**Content-Type**: `application/json`

**Request**:
```json
{
  "recipeTitle": "Risotto ai Funghi Porcini",
  "ingredients": [
    { "name": "funghi porcini", "quantity": "300g" },
    { "name": "riso carnaroli", "quantity": "320g" },
    { "name": "brodo vegetale", "quantity": "1l" }
  ],
  "userCategories": [
    { "id": "cat1", "name": "Primi Piatti" },
    { "id": "cat2", "name": "Secondi" }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "suggestion": {
    "categoryName": "Primi Piatti",
    "season": "autunno",
    "isNewCategory": false
  }
}
```

**Season Values**:
- `primavera` (Spring)
- `estate` (Summer)
- `autunno` (Autumn)
- `inverno` (Winter)
- `tutte_stagioni` (All seasons)

**Logic**:
1. **Category Suggestion**:
   - Analyzes recipe title and ingredients
   - Matches against user's existing categories
   - If no match, proposes new category name
   - Sets `isNewCategory: true` if proposing new category

2. **Season Detection**:
   - Analyzes ingredients against Italian seasonal database
   - Returns most common season among recognized ingredients
   - Defaults to `tutte_stagioni` if ambiguous or no seasonal ingredients found

**Example Seasonal Ingredients**:
- **Primavera**: asparagi, carciofi, fave, piselli, fragole
- **Estate**: pomodori, melanzane, zucchine, basilico, pesche
- **Autunno**: zucca, funghi, castagne, radicchio, uva
- **Inverno**: cavolo nero, agrumi, cime di rapa, finocchi

---

## Contributing

We welcome contributions from the community! Here's how to get started.

### How to Contribute

1. **Fork the Repository**
   - Click "Fork" on GitHub
   - Clone your fork: `git clone https://github.com/YOUR_USERNAME/il-mio-ricettario.git`

2. **Create a Feature Branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```

3. **Read the Documentation**
   - [CLAUDE.md](CLAUDE.md) - Project overview and AI guidelines
   - [AGENTS.md](AGENTS.md) - Common gotchas and patterns (30min+ debug issues)
   - [COMMENTS.md](COMMENTS.md) - Code commenting guidelines

4. **Make Your Changes**
   - Write clean, well-documented code
   - Follow the coding conventions (see [Development](#development))
   - Add tests for new features

5. **Commit Your Changes**
   ```bash
   git commit -m 'Add amazing feature'
   ```
   - Use clear, descriptive commit messages
   - Explain what and why, not how

6. **Push to Your Fork**
   ```bash
   git push origin feature/amazing-feature
   ```

7. **Open a Pull Request**
   - Go to the original repository
   - Click "New Pull Request"
   - Describe your changes clearly
   - Reference any related issues

### Code Review Checklist

Before submitting, ensure:

- [ ] **TypeScript**: Strict mode passes without errors (`npx tsc --noEmit`)
- [ ] **Linting**: ESLint passes (`npm run lint`)
- [ ] **Tests**: All tests pass (`npm test`)
- [ ] **Build**: Production build succeeds (`npm run build`)
- [ ] **Firestore Rules**: Updated if new collections added
- [ ] **Documentation**: Updated if new features added
- [ ] **Clean Code**: No `console.log`, commented-out code, or debug statements

### Coding Standards

**Naming Conventions**:
- **Components**: PascalCase (e.g., `RecipeCard.tsx`)
- **Functions**: camelCase (e.g., `getRecipes`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_FILE_SIZE`)
- **Routes**: kebab-case (e.g., `/estrattore-ricette`)

**File Organization**:
- Components in `src/components/`
- Hooks in `src/lib/hooks/`
- Utils in `src/lib/utils/`
- Types in `src/types/`

**TypeScript**:
- Prefer `interface` for domain models
- Prefer `type` for utility types
- No `any` types—use `unknown` and type guards
- Export types for public APIs

**Styling**:
- Tailwind utilities only
- Use semantic color tokens (`bg-primary`, not `bg-blue-600`)
- Mobile-first responsive design
- Use `cn()` utility for conditional classes

**Firebase**:
- Use `null` for optional fields, never `undefined`
- Always filter queries by `userId`
- Use `serverTimestamp()` for timestamps

### Good First Issues

Looking for where to start? Try these:

- **Add Unit Tests**: Cover utility functions in `src/lib/utils/`
- **Improve Error Messages**: Make error toasts more user-friendly
- **Add i18n Support**: Implement English localization
- **Mobile UI Enhancements**: Improve animations and transitions
- **Documentation**: Fix typos, improve examples, add missing sections
- **Accessibility**: Add ARIA labels, improve keyboard navigation
- **Performance**: Optimize re-renders, add loading states

### Areas Needing Contributions

- **Test Coverage**: Currently limited—need more unit and integration tests
- **E2E Tests**: Implement Playwright or Cypress tests
- **Accessibility**: WCAG 2.1 Level AA compliance
- **Performance**: Bundle size optimization, code splitting
- **Features**: See project issues for feature requests

### Questions?

- **Documentation**: Check [CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md), [COMMENTS.md](COMMENTS.md)
- **Bug Reports**: Open an issue on [GitHub Issues](https://github.com/GiuseppeDM98/il-mio-ricettario/issues)
- **Discussions**: Use [GitHub Discussions](https://github.com/GiuseppeDM98/il-mio-ricettario/discussions) for questions

---

## Troubleshooting

Common issues and solutions.

### Firebase Auth Not Initialized

**Symptom**:
```
Error: Firebase Auth not initialized
```

**Cause**: Missing or incorrect Firebase environment variables

**Solution**:
1. Check `.env.local` file exists in project root
2. Verify all 6 `NEXT_PUBLIC_FIREBASE_*` variables are set
3. Ensure no typos in variable names
4. Restart development server: `npm run dev`

---

### Permission Denied in Firestore

**Symptom**:
```
FirebaseError: Missing or insufficient permissions
```

**Cause**: Security rules not deployed or queries don't filter by `userId`

**Solution**:
1. Deploy security rules:
   ```bash
   firebase deploy --only firestore:rules
   ```
2. Verify rules in Firebase Console → Firestore → Rules tab
3. Check that queries filter by user:
   ```typescript
   query(recipesRef, where('userId', '==', userId))
   ```

---

### PDF Extraction Fails

**Symptom**:
- "API key not configured"
- "File too large"
- Extraction times out

**Solutions**:

**For API key errors**:
1. Verify `ANTHROPIC_API_KEY` in `.env.local`
2. Ensure it does NOT have `NEXT_PUBLIC_` prefix
3. Check API key is active in Anthropic Console
4. Verify account has available credits

**For file size errors**:
1. Check PDF size: must be < 4.4MB (Vercel limit)
2. Compress PDF using:
   - [iLovePDF](https://www.ilovepdf.com/compress_pdf)
   - [Adobe Compress PDF](https://www.adobe.com/acrobat/online/compress-pdf.html)
3. Try splitting multi-page PDFs

**For timeouts**:
1. Try smaller PDF first (1-2 pages)
2. Check Vercel function logs for errors
3. Increase function timeout (Vercel Pro only)

---

### Mobile Navigation Issues

**Symptom**:
- Bottom nav shows on desktop
- Sidebar visible on mobile
- Navigation breaks on rotation

**Solutions**:
1. Check Tailwind config has custom 1440px breakpoint:
   ```javascript
   lg: '1440px'
   ```
2. Use `max-lg:portrait:` not just `portrait:`:
   ```typescript
   className="max-lg:portrait:block lg:hidden"
   ```
3. Clear browser cache and hard reload
4. Test in incognito mode
5. Check browser console for CSS errors

---

### TypeScript Build Errors

**Symptom**:
```
Type error: Property 'X' does not exist on type 'Y'
```

**Solutions**:
1. Run TypeScript compiler:
   ```bash
   npx tsc --noEmit
   ```
2. Check type definitions in `src/types/index.ts`
3. Update `@types` packages:
   ```bash
   npm install --save-dev @types/node@latest @types/react@latest
   ```
4. Restart VS Code/IDE for IntelliSense refresh

---

### Module Not Found Errors

**Symptom**:
```
Module not found: Can't resolve '@/lib/...'
```

**Solutions**:
1. Verify `tsconfig.json` has correct paths:
   ```json
   {
     "compilerOptions": {
       "paths": {
         "@/*": ["./src/*"]
       }
     }
   }
   ```
2. Restart development server
3. Delete `.next` folder and rebuild:
   ```bash
   rm -rf .next
   npm run dev
   ```

---

### Debug Tools

**Enable Firebase Logging** (development only):
```typescript
import { setLogLevel } from 'firebase/firestore';

if (process.env.NODE_ENV === 'development') {
  setLogLevel('debug');
}
```

**Next.js Verbose Logging**:
```bash
DEBUG=* npm run dev
```

**Chrome DevTools**:
- Network tab → Filter for `firebaseio.com` or `anthropic.com`
- React DevTools → Inspect component state
- Performance tab → Check for unnecessary re-renders

---

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

### What This Means

**You Are Free To**:
- ✅ Use the software for any purpose (personal, commercial, educational)
- ✅ Study and modify the source code
- ✅ Distribute copies of the software
- ✅ Distribute modified versions

**Under These Conditions**:
- ⚠️ **Disclose Source**: If you distribute the software, you must make the source code available
- ⚠️ **Same License**: Modifications must be licensed under AGPL-3.0
- ⚠️ **State Changes**: Document significant modifications
- ⚠️ **Network Use = Distribution**: If you host this app publicly, you must provide source access to users

**Important**: The AGPL-3.0 includes a "network use" clause. If you modify this software and run it as a web service (SaaS), you must make your modified source code available to users of that service. This ensures that improvements to the software remain open and accessible to the community.

See [LICENSE.md](LICENSE.md) for the full license text.

### Why AGPL-3.0?

We chose AGPL-3.0 to ensure that this project and any improvements made to it remain open source forever, even when deployed as a web service. This aligns with the values of sharing and community that are central to cooking and recipe exchange.

### Third-Party Licenses

This project uses open-source libraries with the following licenses:

- **Next.js, React**: MIT License
- **Firebase SDK**: Apache License 2.0
- **Anthropic SDK**: MIT License
- **Tailwind CSS**: MIT License
- **Radix UI**: MIT License
- **Lucide React**: ISC License

See `package.json` for the complete list of dependencies and their licenses.

---

## Support

### Documentation

- **README.md** - This file (comprehensive project overview)
- **[SETUP.md](SETUP.md)** - Production deployment guide
- **[CLAUDE.md](CLAUDE.md)** - Developer reference for AI agents
- **[AGENTS.md](AGENTS.md)** - Common gotchas and patterns
- **[COMMENTS.md](COMMENTS.md)** - Code commenting guidelines

### Getting Help

**Bug Reports**:

Found a bug? Open an issue on [GitHub Issues](https://github.com/GiuseppeDM98/il-mio-ricettario/issues) with:
- Clear description of the problem
- Steps to reproduce
- Expected behavior vs actual behavior
- Screenshots (if applicable)
- Environment details (browser, OS, app version)

**Feature Requests**:

Have an idea? Open a feature request on [GitHub Issues](https://github.com/GiuseppeDM98/il-mio-ricettario/issues) with the "enhancement" label:
- Describe the use case
- Explain the problem it solves
- Propose a solution (optional)
- Indicate willingness to contribute

**Discussions**:

For questions, ideas, or general discussion, use [GitHub Discussions](https://github.com/GiuseppeDM98/il-mio-ricettario/discussions).

### Author & Maintainer

**Giuseppe Di Maio**
[@GiuseppeDM98](https://github.com/GiuseppeDM98)

### Acknowledgments

- **Firebase Team** - For backend-as-a-service platform
- **Next.js Team** - For the incredible React framework
- **Anthropic** - For Claude AI and excellent developer experience
- **Open Source Community** - For countless libraries that make this possible
- **You** - For using, contributing to, and improving this project

---

Made with TypeScript and passion for good food.

[⬆ Back to Top](#il-mio-ricettario)
