# Production Deployment Guide

Complete guide for deploying **Il Mio Ricettario** to production using Vercel or Firebase Hosting.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Deployment Options](#deployment-options)
- [Firebase Setup](#firebase-setup)
- [Anthropic API Setup](#anthropic-api-setup)
- [Vercel Deployment](#vercel-deployment)
- [Post-Deployment Verification](#post-deployment-verification)
- [Monitoring & Maintenance](#monitoring--maintenance)
- [Troubleshooting](#troubleshooting)
- [Alternative: Firebase Hosting](#alternative-firebase-hosting)
- [Advanced Configuration](#advanced-configuration)
- [Appendices](#appendices)

---

## Prerequisites

Before you begin, ensure you have:

- [ ] **GitHub account** - For version control and deployment integration
- [ ] **Vercel account** (free tier sufficient) - For hosting the application
- [ ] **Firebase account** (free tier sufficient) - For authentication and database
- [ ] **Anthropic account with API key** - For AI recipe extraction features
- [ ] **Node.js 18+** installed locally - For testing before deployment
- [ ] **Firebase CLI** installed globally:
  ```bash
  npm install -g firebase-tools
  ```

**Time Estimate**: 20-30 minutes for complete setup

---

## Deployment Options

### Option 1: Vercel (Recommended)

**Best for**: Most users, especially those new to deployment

**Advantages**:
- Zero-configuration Next.js deployment
- Automatic HTTPS certificates and global CDN
- Serverless functions for API routes (no server management needed)
- Environment variable management through dashboard
- Git integration (automatic deployments on push to main)
- Free tier: 100GB bandwidth/month, unlimited projects

**Limitations**:
- 4.4MB request body limit (affects maximum PDF upload size)
- 10-second serverless function timeout on free tier
- Vendor lock-in to Vercel platform

**When to choose**: Default choice for most deployments

---

### Option 2: Firebase Hosting

**Best for**: Users who want everything on Firebase, or need static hosting

**Advantages**:
- Same provider as Firestore backend (single dashboard)
- Free tier: 10GB storage, 360MB/day transfer
- Custom domains with automatic SSL
- SPA-friendly hosting

**Limitations**:
- Static export only (no server-side rendering)
- API routes require Cloud Functions setup (additional complexity)
- AI extraction features need extra configuration
- Build-time environment variables only

**When to choose**: You prefer Firebase's ecosystem or want a fully static site

---

### Option 3: Docker Compose (Self-Hosted)

**Best for**: Users who want to deploy the full app on a single machine or VPS without Vercel

**Advantages**:
- Full Next.js app with server-side API routes
- No platform lock-in
- Works on any machine that can run Docker Compose
- Easy to move between local machine, NAS, or VPS

**Limitations**:
- You manage TLS, reverse proxy, logs, and updates
- `NEXT_PUBLIC_*` Firebase values must be present at image build time
- Google sign-in in production requires a public hostname added to Firebase Auth authorized domains

**When to choose**: You want a self-hosted deployment with the same application behavior as Vercel

---

**Recommendation**: Use Vercel for the simplest managed deployment, or Docker Compose if you want to self-host the full application. This guide covers Vercel first, then Docker Compose, with Firebase Hosting as a static alternative at the end.

---

## Firebase Setup

Firebase provides authentication and database services for the application. Complete this setup regardless of which deployment option you choose.

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "**Add project**" or "Create a project"
3. **Project name**: Enter a name (e.g., `my-recipe-book-prod`)
4. **Google Analytics**: Optional (recommended for tracking)
5. Click "**Create project**" and wait ~30 seconds for initialization

**Verification**: You should see the Firebase project dashboard with "Get started" options

---

### Step 2: Enable Authentication

1. In the Firebase Console sidebar, click **Authentication**
2. Click "**Get started**"
3. Go to the "**Sign-in method**" tab

**Enable Email/Password Authentication**:
1. Click "**Email/Password**"
2. Toggle the first switch (Email/Password) to **Enabled**
3. Leave "Email link" disabled (optional feature)
4. Click "**Save**"

**Enable Google Sign-In**:
1. Click "**Google**" provider
2. Toggle to **Enabled**
3. **Project support email**: Select your email from dropdown
4. **Project public-facing name**: (Auto-filled, leave as is)
5. Click "**Save**"

**Verification**:
- Both "Email/Password" and "Google" should show green "Enabled" status
- You should see these providers in the sign-in method list

---

### Step 3: Create Firestore Database

1. In the sidebar, click **Firestore Database**
2. Click "**Create database**"

**Security Rules**:
- Select "**Start in production mode**"
- (We'll deploy custom rules in the next step)

**Location**:
Choose the closest region to your primary users:
- **Europe**: `eur3` (Belgium) or `europe-west1` (Belgium)
- **United States**: `us-central` (Iowa) or `us-east1` (South Carolina)
- **Asia**: `asia-southeast1` (Singapore) or `asia-northeast1` (Tokyo)

**Important**: Location cannot be changed after creation!

3. Click "**Enable**"
4. Wait ~1 minute for database creation

**Verification**: Empty Firestore console appears with "Start collection" option

---

### Step 4: Deploy Firestore Security Rules

The project includes owner-based security rules that ensure users can only access their own data.

**Clone the Repository** (if not already done):
```bash
git clone https://github.com/GiuseppeDM98/il-mio-ricettario.git
cd il-mio-ricettario
```

**Login to Firebase**:
```bash
firebase login
```
- Opens browser for authentication
- Allow Firebase CLI to access your account
- Return to terminal when authenticated

**Link Your Project**:
```bash
firebase use --add
```
- Select your Firebase project from the list
- **Alias name**: Enter `default` (or custom name)
- Confirms: "Now using alias default"

**Deploy Security Rules**:
```bash
firebase deploy --only firestore:rules
```

**Expected Output**:
```
=== Deploying to 'your-project-name'...

i  deploying firestore
i  firestore: reading rules from firebase/firestore.rules...
✔  firestore: rules file firebase/firestore.rules compiled successfully
✔  firestore: released rules firestore.rules to cloud.firestore

✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/...
```

**Verification**:
1. Go to Firebase Console → **Firestore Database** → **Rules** tab
2. You should see rules with functions:
   - `isAuthenticated()` - Checks if user is logged in
   - `isOwner(userId)` - Verifies user owns the data
3. Rules enforce `userId` on all collections

---

### Step 5: Get Firebase Configuration

1. In Firebase Console, click the **gear icon ⚙️** → **Project settings**
2. Scroll to "**Your apps**" section
3. If you don't have a web app registered yet:
   - Click the web icon **`</>`**
   - **App nickname**: "Il Mio Ricettario Web"
   - **Don't** check "Also set up Firebase Hosting"
   - Click "**Register app**"
4. You'll see a `firebaseConfig` object:

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

**Copy all 6 values** - you'll need them when configuring environment variables in Vercel.

**Security Note**: These values are safe to expose in client-side code (they're `NEXT_PUBLIC_` variables). Security is enforced by Firestore rules, not by hiding these values.

---

### Step 6: Configure Authorized Domains (Post-Deployment)

**Important**: Complete this step AFTER deploying to Vercel in Step 7 below.

After you have your Vercel deployment URL:

1. Return to Firebase Console → **Authentication** → **Settings**
2. Click "**Authorized domains**" tab
3. By default, only `localhost` and `*.firebaseapp.com` are authorized
4. Click "**Add domain**"
5. Enter your Vercel deployment URL (without `https://`):
   - Example: `il-mio-ricettario-abc123.vercel.app`
6. Click "**Add**"

**If using a custom domain**, add it here as well:
- Example: `recipes.yourdomain.com`

**Without this step**, authentication will fail with "Unauthorized domain" errors on your deployed app.

---

## Anthropic API Setup

Anthropic's Claude AI powers the PDF recipe extraction feature.

### Step 1: Create Anthropic Account

1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Click "**Sign Up**"
3. Verify your email address
4. (Optional) Add billing information
   - New accounts get **$5 in free credits**
   - Pay-as-you-go: ~$0.05-$0.15 per PDF extraction (10-20 recipes)

---

### Step 2: Create API Key

1. In Anthropic Console, navigate to **API Keys** section (left sidebar)
2. Click "**Create Key**"
3. **Name**: "Il Mio Ricettario Production"
4. Click "**Create**"
5. **Copy the API key immediately** - it's only shown once!
   - Format: `sk-ant-api03-...`

**Save this key securely** - you'll add it to Vercel environment variables.

---

### Pricing Reference

**Claude Sonnet 4.5** pricing (as of January 2026):
- Input: ~$3 per million tokens
- Output: ~$15 per million tokens

**Typical usage**:
- 1 PDF with 10-20 recipes: **$0.05-$0.15**
- 100 PDFs per month: **$5-$15**
- Free tier covers ~30-100 PDFs

---

## Vercel Deployment

Deploy the Next.js application to Vercel.

### Step 1: Prepare Repository

Ensure your code is pushed to GitHub:

```bash
cd il-mio-ricettario
git status                        # Check for uncommitted changes
git add .                         # Stage all changes
git commit -m "Prepare for production deployment"
git push origin main              # Push to GitHub
```

**Verification**: Visit your GitHub repository - latest commit should appear

---

### Step 2: Create Vercel Account

1. Go to [vercel.com](https://vercel.com/)
2. Click "**Sign Up**"
3. Choose "**Continue with GitHub**"
4. Authorize Vercel to access your GitHub account
5. Select which repositories Vercel can access:
   - **Recommended**: "Only select repositories" → Select `il-mio-ricettario`
   - Alternative: "All repositories" (not recommended for security)

**Verification**: You should see the Vercel dashboard

---

### Step 3: Import Project

1. In Vercel Dashboard, click "**Add New...**" → "**Project**"
2. **Import Git Repository**: Find `il-mio-ricettario` in the list
3. Click "**Import**"

**Project Configuration** (auto-detected):
- **Framework Preset**: Next.js ✓
- **Root Directory**: `./`
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm install`

**Important**: Don't deploy yet! We need to add environment variables first.

---

### Step 4: Add Environment Variables

In the "**Environment Variables**" section, add all 8 variables:

**Firebase Variables** (from Firebase Setup - Step 5):

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSyC...` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `your-project-id` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `your-project.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `123456789012` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:123456789012:web:abcdef` |

**Anthropic Variable** (from Anthropic Setup - Step 2):

| Name | Value |
|------|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` |

**Optional Toggle**:

| Name | Value | Description |
|------|-------|-------------|
| `NEXT_PUBLIC_REGISTRATIONS_ENABLED` | `true` or `false` | Enable/disable new user registrations |

**For each variable**:
1. Enter the **Name** exactly as shown (case-sensitive)
2. Paste the **Value**
3. Select all environments: **Production**, **Preview**, **Development**
4. Click "Add"

**Critical Notes**:
- Double-check spelling (especially `NEXT_PUBLIC_` prefix)
- `ANTHROPIC_API_KEY` does NOT have `NEXT_PUBLIC_` prefix (server-only)
- No quotes around values

---

### Step 5: Deploy

1. After adding all environment variables, click "**Deploy**"
2. Vercel will:
   - Install dependencies (~1 minute)
   - Build the application (~2 minutes)
   - Deploy to global CDN (~1 minute)

**Build Process**:
```
Running "npm run build"
> next build

Linting and checking validity of types...
✓ Linting and checking types complete
Creating an optimized production build...
✓ Compiled successfully

Uploading build outputs...
✓ Build complete

Deployment ready!
```

**Deployment Time**: 2-5 minutes total

---

### Step 6: Get Deployment URL

After successful deployment:

1. Vercel shows "**Congratulations!**" screen
2. Copy your deployment URL:
   - Format: `https://il-mio-ricettario-[random-id].vercel.app`
   - Example: `https://il-mio-ricettario-7xk2p9m1.vercel.app`

**Save this URL** - you need it for Firebase authorized domains (next step)

---

### Step 7: Authorize Vercel Domain in Firebase

**Return to Firebase Setup - Step 6** (if not already completed):

1. Firebase Console → **Authentication** → **Settings** → **Authorized domains**
2. Click "**Add domain**"
3. Enter your Vercel URL (without `https://`):
   - Example: `il-mio-ricettario-7xk2p9m1.vercel.app`
4. Click "**Add**"

**Verification**: Domain should appear in the authorized list

---

### Step 8: Test Deployment

Open your Vercel URL in a browser and verify:

**Basic Functionality**:
- [ ] Login page loads without errors
- [ ] Can register a new account (if `NEXT_PUBLIC_REGISTRATIONS_ENABLED=true`)
- [ ] Can login with email/password
- [ ] Can logout

**Google Sign-In** (should now work after adding authorized domain):
- [ ] Click "Sign in with Google"
- [ ] Select Google account
- [ ] Redirects back to app successfully
- [ ] User is logged in

**Recipe Management**:
- [ ] Can create a recipe manually
- [ ] Recipe appears in list
- [ ] Can edit recipe
- [ ] Can delete recipe

**PDF Extraction** (if `ANTHROPIC_API_KEY` configured):
- [ ] Navigate to "Estrattore Ricette"
- [ ] Upload a small test PDF (< 1MB)
- [ ] Wait 15-60 seconds for extraction
- [ ] Recipes appear in preview
- [ ] Can save extracted recipes

**If any tests fail**, see [Troubleshooting](#troubleshooting) section.

---

### Step 9: Custom Domain (Optional)

To use your own domain instead of `.vercel.app`:

1. In Vercel Dashboard, go to your project → **Settings** → **Domains**
2. Click "**Add**"
3. Enter your domain:
   - Example: `recipes.yourdomain.com`
   - Or apex domain: `yourdomain.com`
4. Vercel provides DNS configuration instructions

**DNS Configuration** (at your domain provider):

**For subdomain** (`recipes.yourdomain.com`):
| Type | Name | Value |
|------|------|-------|
| CNAME | recipes | cname.vercel-dns.com |

**For apex domain** (`yourdomain.com`):
| Type | Name | Value |
|------|------|-------|
| A | @ | 76.76.21.21 |

5. Wait for DNS propagation (5 minutes - 48 hours)
6. Vercel automatically provisions SSL certificate

**After DNS propagates**:
- Add custom domain to Firebase authorized domains (Step 7)
- Test authentication flow on custom domain

---

## Post-Deployment Verification

Complete testing checklist to ensure everything works.

### Authentication Tests

**Email/Password Flow**:
- [ ] Register new user with email/password
- [ ] Receive authentication confirmation
- [ ] Logout successfully
- [ ] Login again with same credentials
- [ ] Check Firebase Console → Authentication → Users (user should appear)

**Google OAuth Flow**:
- [ ] Click "Sign in with Google" button
- [ ] Select Google account
- [ ] Grant permissions
- [ ] Verify redirect back to app
- [ ] Check user is logged in
- [ ] User appears in Firebase Authentication users list

**Edge Cases**:
- [ ] Try accessing `/ricette` without login → should redirect to `/login`
- [ ] Login, then manually navigate to `/login` → should redirect to `/ricette`
- [ ] Test logout from different pages (recipe list, detail, categories)

---

### Recipe Management Tests

**Create Recipe**:
- [ ] Navigate to "Nuova Ricetta" (New Recipe)
- [ ] Fill in all fields (title, ingredients, steps, servings)
- [ ] Select category and season
- [ ] Click "Salva" (Save)
- [ ] Recipe appears in list

**Edit Recipe**:
- [ ] Open recipe detail
- [ ] Click "Modifica" (Edit)
- [ ] Change recipe title
- [ ] Add/remove ingredients
- [ ] Save changes
- [ ] Verify changes persist

**Delete Recipe**:
- [ ] Open recipe detail
- [ ] Click delete button
- [ ] Confirm deletion
- [ ] Verify recipe removed from list

**Filtering**:
- [ ] Filter by category → count updates
- [ ] Filter by subcategory → list updates
- [ ] Filter by season → shows only matching recipes
- [ ] Combine filters → works correctly

---

### PDF Extraction Tests

**Successful Extraction**:
- [ ] Navigate to "Estrattore Ricette"
- [ ] Upload a test PDF (< 2MB, text-based)
- [ ] Wait 15-60 seconds
- [ ] Verify recipes extracted correctly
- [ ] Check AI category suggestions are relevant
- [ ] Check AI season detection matches ingredient database
- [ ] Edit category/season before saving (if needed)
- [ ] Save one or more recipes
- [ ] Verify saved recipes appear in recipe list

**Error Handling**:
- [ ] Try uploading file > 4.4MB → should show error message
- [ ] Try uploading non-PDF file → should show error
- [ ] Try uploading corrupted PDF → should handle gracefully

**AI Suggestions**:
- [ ] Verify "Suggested by AI" badges appear
- [ ] Check category suggestions use existing categories when appropriate
- [ ] Verify new category proposals make sense
- [ ] Check season classification is reasonable for ingredients

---

### Cooking Mode Tests

**Start Cooking**:
- [ ] Open a recipe detail
- [ ] Click "Inizia a Cucinare" (Start Cooking)
- [ ] Setup screen appears with serving size selector
- [ ] Select different serving size
- [ ] Ingredient quantities scale correctly (Italian decimal format: 1,5 kg)
- [ ] Click "Inizia" (Start)

**During Cooking**:
- [ ] Screen stays awake (doesn't auto-sleep)
- [ ] Check off ingredients as used → checkbox persists
- [ ] Check off steps as completed → checkbox persists
- [ ] Progress bar updates in real-time
- [ ] Percentage calculation is correct

**Session Persistence**:
- [ ] Close browser tab while cooking
- [ ] Reopen app
- [ ] Navigate to "Cotture in Corso" (Active Cooking)
- [ ] Verify session appears in dashboard
- [ ] Click session → resumes exactly where you left off

**Completion**:
- [ ] Complete all ingredients (100% ingredients checked)
- [ ] Complete all steps (100% steps checked)
- [ ] Verify progress shows 100%
- [ ] Close cooking mode
- [ ] Verify session auto-deleted from "Cotture in Corso"

---

### Mobile Responsiveness Tests

**Desktop** (screen width ≥ 1440px):
- [ ] Persistent sidebar visible on left
- [ ] No bottom navigation bar
- [ ] No hamburger menu
- [ ] All functionality accessible

**Tablet/Laptop Portrait** (768px - 1439px):
- [ ] Sidebar hidden
- [ ] Bottom navigation appears with 4 tabs:
   - Ricette
   - Categorie
   - Cotture in Corso
   - More
- [ ] "More" opens sheet with additional options
- [ ] Touch targets are appropriately sized

**Mobile Portrait** (< 768px):
- [ ] Bottom navigation present
- [ ] All tabs accessible
- [ ] Text remains readable
- [ ] Forms are usable with mobile keyboard

**Mobile Landscape**:
- [ ] Bottom navigation hidden
- [ ] Hamburger menu appears in header
- [ ] Tapping hamburger opens sidebar
- [ ] Sidebar slides in from left
- [ ] Overlay closes sidebar when clicked

---

## Monitoring & Maintenance

### Vercel Analytics

**Enable Analytics** (free tier available):
1. Vercel Dashboard → Your project → **Analytics** tab
2. Toggle "**Enable Analytics**"

**Metrics Available**:
- Page views (by route)
- Unique visitors
- Top pages
- Devices breakdown (mobile/desktop/tablet)
- Browser distribution

**Use cases**:
- Track which recipes get most views
- Identify popular features
- Monitor traffic growth

---

### Error Monitoring

**Vercel Function Logs**:
1. Vercel Dashboard → **Deployments** → Latest deployment
2. Click "**Functions**" tab
3. View logs for `/api/extract-recipes` and `/api/suggest-category`

**Common Errors to Monitor**:
- `ANTHROPIC_API_KEY not configured` - Check environment variables
- `Body size exceeded` - User uploaded PDF > 4.4MB
- `Firebase permission denied` - Security rules issue or userId mismatch
- `Claude API error` - Anthropic API down or quota exceeded

**Setting Up Alerts** (Vercel Pro feature):
- Slack notifications for failed deployments
- Email alerts for function errors
- Custom webhooks for CI/CD integration

---

### Firestore Usage Monitoring

1. Firebase Console → Your project → **Usage and billing**
2. Monitor:
   - **Document reads**: Queries fetching recipes
   - **Document writes**: Creating/updating recipes
   - **Storage**: Total recipe data stored

**Free Tier Limits**:
- **Reads**: 50,000 per day
- **Writes**: 20,000 per day
- **Storage**: 1 GB

**Typical Usage** (100 recipes, 1 active user):
- Reads: ~500/day
- Writes: ~50/day
- Storage: ~5 MB

**When to upgrade**: If you consistently hit 70% of limits

---

### Anthropic API Usage

1. Anthropic Console → **Usage** section
2. Monitor:
   - Tokens consumed (input + output)
   - Cost per day
   - Requests per day

**Cost Estimation**:
- 1 PDF (10 recipes): ~$0.05-$0.15
- 100 PDFs/month: ~$5-$15
- Heavy user (500 PDFs/month): ~$25-$75

**Set Spending Limits**:
1. Anthropic Console → **Settings** → **Billing**
2. Set monthly budget cap
3. Receive email alerts at 50%, 80%, 100% of budget

---

### Code Updates & Redeployment

Vercel automatically redeploys on push to `main` branch:

```bash
# Make changes locally
git add .
git commit -m "feat: add new feature"
git push origin main
```

**Automatic Deployment**:
1. Vercel detects push to GitHub
2. Triggers new build automatically
3. Deploys to production (2-5 minutes)
4. Previous deployment becomes accessible via unique URL

**Manual Redeployment** (if needed):
1. Vercel Dashboard → **Deployments**
2. Find successful deployment
3. Click "..." → "**Redeploy**"

**Rollback** (if new deployment has issues):
1. Vercel Dashboard → **Deployments**
2. Find previous working deployment
3. Click "..." → "**Promote to Production**"
4. Previous version becomes live immediately

---

## Troubleshooting

Common deployment issues and solutions.

### Build Fails on Vercel

**Symptom**:
- Deployment status shows "Failed"
- Build logs show TypeScript errors or module not found

**Solutions**:

1. **Verify build works locally**:
   ```bash
   npm run build
   ```
   Fix any errors before pushing

2. **Check TypeScript errors**:
   ```bash
   npx tsc --noEmit
   ```
   Resolve type errors

3. **Update dependencies**:
   ```bash
   npm install --save-dev @types/node@latest @types/react@latest
   npm run build
   ```

4. **Clear Vercel cache**:
   - Redeploy with "Force rebuild" option

---

### Environment Variables Not Working

**Symptom**:
- App works locally but fails on Vercel
- Firebase auth errors
- "API key not configured" messages

**Solutions**:

1. **Verify all variables are set**:
   - Vercel Dashboard → Settings → **Environment Variables**
   - Check all 8 variables are present

2. **Check variable spelling**:
   - `NEXT_PUBLIC_FIREBASE_API_KEY` (not `FIREBASE_API_KEY`)
   - `ANTHROPIC_API_KEY` (no `NEXT_PUBLIC_` prefix)

3. **Verify environment selection**:
   - Each variable should be enabled for: Production, Preview, Development

4. **Redeploy after changes**:
   - Environment variable changes require redeployment
   - Vercel Dashboard → Deployments → "..." → Redeploy

---

### Google Sign-In Fails

**Symptom**:
- Error: "redirect_uri_mismatch"
- Error: "This domain is not authorized"

**Solutions**:

1. **Add domain to Firebase authorized domains**:
   - Firebase Console → Authentication → Settings → Authorized domains
   - Add your Vercel URL: `your-app.vercel.app`

2. **Wait for propagation**:
   - Changes may take 5-10 minutes to take effect

3. **Clear browser cache**:
   - Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
   - Try incognito mode

4. **Check OAuth consent screen**:
   - Firebase Console → Authentication → Sign-in method → Google
   - Ensure project support email is set

**For Docker/self-hosted deployments**:
5. **Authorize the public hostname you actually use**:
   - Add `recipes.yourdomain.com` or your VPS hostname to Firebase → Authentication → Settings → Authorized domains
   - If you access the container through a reverse proxy, authorize the external hostname, not the internal container name
6. **Use HTTPS in production**:
   - Google sign-in is reliable in production only when the app is served from its real public URL over HTTPS
7. **Fallback if you do not want OAuth setup**:
   - Set `NEXT_PUBLIC_REGISTRATIONS_ENABLED=false`
   - This disables new registrations and hides the Google sign-in path in the UI

---

### Docker Environment or Build Problems

**Symptom**:
- Firebase config is `undefined` inside the browser
- Login page loads but Google/email auth fails immediately
- Container starts, but AI endpoints return "API key not configured"

**Solutions**:

1. **Build with the public Firebase variables present**:
   - `NEXT_PUBLIC_FIREBASE_*` and `NEXT_PUBLIC_REGISTRATIONS_ENABLED` must exist when `docker build` runs
   - `docker compose --env-file .env.local up --build` handles this automatically from your env file

2. **Keep `ANTHROPIC_API_KEY` at runtime**:
   - Pass it through Compose `environment:` or `docker run -e`
   - Do not convert it to `NEXT_PUBLIC_`

3. **Rebuild after changing public env**:
   - Changes to `NEXT_PUBLIC_*` require a fresh image build because the client bundle is already compiled

4. **Verify the Firebase project values match the project you deployed rules to**:
   - Wrong `projectId` or `authDomain` can look like a networking issue while actually pointing the app at the wrong backend

---

### PDF Extraction Not Working

**Symptom**:
- "API key not configured" error
- Extraction times out
- "Request failed" errors

**Solutions**:

**For API key errors**:
1. Verify `ANTHROPIC_API_KEY` is set in Vercel environment variables
2. Ensure it does NOT have `NEXT_PUBLIC_` prefix
3. Check API key is active in Anthropic Console
4. Verify account has available credits

**For timeouts**:
1. Try smaller PDF first (< 1MB, 1-5 recipes)
2. Check Vercel function logs for detailed error
3. Large PDFs (> 3MB) may hit 10s timeout on free tier
4. Consider upgrading to Vercel Pro for 60s timeouts

**For file size errors**:
1. Compress PDF using [iLovePDF](https://www.ilovepdf.com/compress_pdf)
2. Split large PDFs into smaller files
3. 4.4MB is hard limit (Vercel request body size)

---

### Firestore Permission Denied

**Symptom**:
- Error: "Missing or insufficient permissions"
- Queries fail after deployment
- Can't read/write recipes

**Solutions**:

1. **Verify security rules are deployed**:
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Check rules in Firebase Console**:
   - Firestore Database → Rules tab
   - Verify `isAuthenticated()` and `isOwner()` functions exist

3. **Verify queries filter by userId**:
   ```typescript
   // In your code
   query(recipesRef, where('userId', '==', userId))
   ```

4. **Test with Firebase Rules Simulator**:
   - Firebase Console → Firestore → Rules → Simulator
   - Test read/write operations

---

### Mobile Navigation Broken

**Symptom**:
- Bottom nav shows on desktop
- Sidebar shows on mobile
- Navigation disappears on rotation

**Solutions**:

1. **Verify Tailwind breakpoint**:
   ```javascript
   // tailwind.config.ts
   lg: '1440px'  // Must be custom value
   ```

2. **Check responsive classes**:
   ```typescript
   // Use max-lg:portrait: not just portrait:
   className="max-lg:portrait:block lg:hidden"
   ```

3. **Clear Vercel cache and redeploy**

4. **Test in different browsers** (Chrome, Firefox, Safari)

---

## Docker Compose (Self-Hosted)

Deploy the full Next.js application on your own machine or VPS with Docker Compose.

### Prerequisites

- Docker Engine + Docker Compose plugin installed
- Firebase project configured
- Anthropic API key if you want AI features
- A public hostname and HTTPS if you want Google sign-in in production

**Recommended use cases**:
- Single VPS deployment
- Home server or NAS deployment
- Local production-like environment on your own machine

---

### Step 1: Prepare Environment Variables

Copy the example file:

```bash
cp .env.example .env.local
```

Fill in all values in `.env.local`.

**Important runtime model**:
- `NEXT_PUBLIC_FIREBASE_*` and `NEXT_PUBLIC_REGISTRATIONS_ENABLED` are consumed at **build time** by Next.js and must be present when the Docker image is built
- `ANTHROPIC_API_KEY` is consumed at **runtime** by the server

**Why this matters**:
- If you change any `NEXT_PUBLIC_*` value, you must rebuild the image
- If you change only `ANTHROPIC_API_KEY`, restarting the container is enough

---

### Step 2: Build and Start the App

From the project root:

```bash
docker compose --env-file .env.local up --build
```

This command:
- builds the production image from `Dockerfile`
- passes the Firebase public config as Docker build args
- starts the app on port `3000`

Open:

- Local machine: `http://localhost:3000`
- VPS with firewall opened: `http://your-server-ip:3000`

To run in the background:

```bash
docker compose --env-file .env.local up --build -d
```

To stop:

```bash
docker compose down
```

---

### Step 3: Verify Local Self-Hosted Deployment

Check these flows:

- [ ] Login page loads
- [ ] Email/password login works
- [ ] Manual recipe creation works
- [ ] AI endpoints work if `ANTHROPIC_API_KEY` is configured

**For Google sign-in on localhost**:
- `localhost` is usually already authorized in Firebase Auth
- If needed, verify Firebase Console → Authentication → Settings → Authorized domains includes `localhost`

---

### Step 4: Enable Google Sign-In in Production

Google sign-in is compatible with Docker deployments, but the deployed origin must be authorized.

**Requirements**:
- A stable public hostname such as `recipes.yourdomain.com`
- HTTPS terminated by your reverse proxy or hosting platform
- The exact hostname added to Firebase Auth authorized domains

**Configuration steps**:
1. Deploy the container behind a public hostname
2. Configure HTTPS with your reverse proxy or hosting platform
3. Open Firebase Console → **Authentication** → **Settings** → **Authorized domains**
4. Add your hostname without protocol:
   - `recipes.yourdomain.com`
   - or `my-vps.example.net`
5. Save and wait a few minutes for propagation

**Important**:
- Authorize the hostname users actually visit, not the Docker service name
- If you use `https://recipes.yourdomain.com`, add `recipes.yourdomain.com`
- Internal names like `app`, `container`, or `localhost` do not help for public production traffic

---

### Step 5: Fallback Without Google OAuth

If you do not want to configure Google sign-in for self-hosted production:

```env
NEXT_PUBLIC_REGISTRATIONS_ENABLED=false
```

This is the supported fallback path. It hides the Google sign-in path and disables new registrations.

**Use this when**:
- the app is internal-only
- you do not have a stable public hostname yet
- you want to keep self-hosted access limited to existing accounts

After changing this value, rebuild the image:

```bash
docker compose --env-file .env.local up --build
```

---

### Step 6: Optional Reverse Proxy and Domain Setup

For production, do not expose plain port `3000` directly unless this is an internal deployment.

**Recommended pattern**:
- Caddy, Nginx, Traefik, or your platform load balancer terminates HTTPS
- Proxy traffic to `http://app:3000` on the Docker network or `http://127.0.0.1:3000` on the host

**Benefits**:
- HTTPS for Google sign-in and secure sessions
- Stable public URL
- Easier certificate management

**Minimum rule**:
- Keep one canonical public URL and add that same hostname to Firebase authorized domains

---

## Alternative: Firebase Hosting

Deploy to Firebase Hosting instead of Vercel.

### Limitations

**Important Limitations**:
- Static export only (no server-side rendering)
- API routes (`/api/extract-recipes`, `/api/suggest-category`) **will not work**
- AI extraction features require Cloud Functions setup (not covered here)
- Build-time environment variables only

**Recommendation**: Use this only if you don't need AI features or if you're willing to set up Cloud Functions separately.

---

### Step 1: Modify Next.js Config

Edit `next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',  // Changed from 'standalone'
  images: {
    unoptimized: true,
  },
  // Remove redirects - not supported in static export
}

module.exports = nextConfig
```

---

### Step 2: Build Static Export

```bash
npm run build
```

Output will be in `/out` directory.

**Verification**: Check that `/out` folder exists and contains `index.html`

---

### Step 3: Initialize Firebase Hosting

```bash
firebase init hosting
```

**Configuration**:
- **Public directory**: Enter `out`
- **Configure as single-page app**: Enter `Yes`
- **Set up automatic builds with GitHub**: Enter `No` (for now)
- **Overwrite index.html**: Enter `No`

**Generated files**:
- `firebase.json` - Hosting configuration
- `.firebaserc` - Project aliases

---

### Step 4: Deploy to Firebase Hosting

```bash
firebase deploy --only hosting
```

**Output**:
```
=== Deploying to 'your-project'...

i  deploying hosting
i  hosting[your-project]: beginning deploy...
✔  hosting[your-project]: file upload complete
✔  hosting[your-project]: version finalized
✔  hosting[your-project]: release complete

✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/your-project/overview
Hosting URL: https://your-project.web.app
```

---

### Step 5: Test Deployment

Open `https://your-project.web.app`:

**Working Features**:
- [ ] Login page loads
- [ ] Authentication works (email/password + Google)
- [ ] Can create recipes manually
- [ ] Cooking mode works

**Not Working**:
- [ ] PDF extraction (requires Cloud Functions)
- [ ] AI category suggestions (requires Cloud Functions)

---

### Step 6: Custom Domain (Firebase)

1. Firebase Console → **Hosting** → Click your site
2. Click "**Add custom domain**"
3. Enter your domain: `recipes.yourdomain.com`
4. **Verify ownership**:
   - Add TXT record to your DNS:
     ```
     TXT @ firebase=[random-value]
     ```
5. **Add A records** (provided by Firebase):
   ```
   A @ [IP-address-1]
   A @ [IP-address-2]
   ```
6. Wait for DNS propagation (5 min - 48 hours)
7. Firebase auto-provisions SSL certificate

---

## Advanced Configuration

### Performance Optimization

**Vercel Configuration** (`vercel.json`):

```json
{
  "buildCommand": "npm run build",
  "framework": "nextjs",
  "functions": {
    "api/extract-recipes.ts": {
      "maxDuration": 60,
      "memory": 1024
    }
  }
}
```

**Benefits**:
- Increase function timeout to 60s (requires Vercel Pro)
- Allocate more memory for large PDF processing

---

### Security Headers

Add security headers in `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        }
      ]
    }
  ]
}
```

---

### Firebase App Check (Optional)

Protect Firebase backend from abuse:

1. Firebase Console → **App Check**
2. Click "**Get started**"
3. Select platform: **Web**
4. **reCAPTCHA provider**:
   - Register at [Google reCAPTCHA](https://www.google.com/recaptcha/admin)
   - Get site key
   - Add to Firebase App Check
5. **Enforcement**: Start with "Unenforced" (monitoring only)
6. After testing, switch to "Enforced"

**Benefits**:
- Prevents API abuse
- Blocks bots and scrapers
- No impact on legitimate users

---

## Appendices

### Appendix A: Environment Variables Quick Reference

Complete reference of all environment variables:

| Variable | Required | Value | Where to Find |
|----------|----------|-------|---------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes | `AIzaSyC...` | Firebase Console → Project settings → Your apps → Web app config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes | `your-project.firebaseapp.com` | Same as above |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes | `your-project-id` | Same as above |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Yes | `your-project.appspot.com` | Same as above |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Yes | `123456789012` | Same as above |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Yes | `1:123:web:abc` | Same as above |
| `ANTHROPIC_API_KEY` | Yes* | `sk-ant-api03-...` | Anthropic Console → API Keys → Create Key |
| `NEXT_PUBLIC_REGISTRATIONS_ENABLED` | No | `true` or `false` | Manual setting (default: `true`) |

\* Required for AI extraction features. App works without it for manual recipe entry.

---

### Appendix B: Useful Commands

**Firebase**:
```bash
# Login
firebase login

# Link project
firebase use --add

# Deploy rules
firebase deploy --only firestore:rules

# Deploy hosting
firebase deploy --only hosting

# View logs
firebase functions:log
```

**Vercel**:
```bash
# Install CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Deploy to production
vercel --prod

# List environment variables
vercel env ls

# View logs
vercel logs
```

**Docker Compose**:
```bash
# Build and run in foreground
docker compose --env-file .env.local up --build

# Build and run in background
docker compose --env-file .env.local up --build -d

# Stop services
docker compose down

# View logs
docker compose logs -f
```

**Development**:
```bash
# Local dev server
npm run dev

# Build (check for errors)
npm run build

# Run tests
npm test

# Type check
npx tsc --noEmit
```

---

### Appendix C: Checklist

**Pre-Deployment**:
- [ ] Firebase project created
- [ ] Authentication enabled (Email + Google)
- [ ] Firestore database created
- [ ] Security rules deployed
- [ ] Firebase config copied
- [ ] Anthropic API key obtained
- [ ] Code pushed to GitHub

**Vercel Deployment**:
- [ ] Vercel account created
- [ ] Project imported from GitHub
- [ ] All 8 environment variables added
- [ ] Deployed successfully
- [ ] Deployment URL copied
- [ ] Vercel domain added to Firebase authorized domains

**Docker Deployment**:
- [ ] Docker and Docker Compose installed
- [ ] `.env.local` created from `.env.example`
- [ ] All Firebase variables set before image build
- [ ] `ANTHROPIC_API_KEY` set for runtime if AI features are needed
- [ ] `docker compose --env-file .env.local up --build` completed successfully
- [ ] Public hostname added to Firebase authorized domains if Google sign-in is required
- [ ] HTTPS configured if deployment is public

**Post-Deployment**:
- [ ] Login works (email/password)
- [ ] Google sign-in works
- [ ] Can create/edit/delete recipes
- [ ] PDF extraction works (if API key configured)
- [ ] Cooking mode works
- [ ] Mobile navigation works on all devices

---

**Deployment Complete!** 🎉

Your application is now live and ready for use. Monitor logs, gather user feedback, and iterate on features.

For questions or issues:
- Check [Troubleshooting](#troubleshooting)
- Review [README.md](README.md) for project documentation
- Open an issue on [GitHub](https://github.com/GiuseppeDM98/il-mio-ricettario/issues)
