# Simply Comical Portfolio & Dynamic CMS
A premium, highly polished digital showcase and illustration portfolio for **Preetham Bharadwaj** (`bharadwajpreetham@gmail.com`). 

This full-stack application includes customized galleries, slice-of-life comedy series comic builders, administrative logins, a dynamic verification system, live client lead inquiry capture forms, and moderation dashboards.

---

## 🚀 Deployment & Hosting Guide

Depending on your production requirements, you can host this application under two different styles:
1.  **Option A (Static Only - completely FREE)**: Deploy the compiled client directly to **GitHub Pages** or **Cloudflare Pages**.
2.  **Option B (Full-Stack - RECOMMENDED)**: Serve the frontend asset bundle statically, and host the small Node.js server on a container-capable runtime (like **Render**, **Railway**, **Fly.io**, or **Cloud Run**). This preserves 100% of the live CMS, comments, and email inquiry forwarding.

---

## 🖥️ Option A: Deploying on GitHub Pages (Static Mode)

GitHub Pages acts as a super-stable static server. If hosted in static-only mode:
*   Your galleries, brand stories, categories, and reviews load as standard **read-only content** compiled from local databases.
*   CMS uploads, changes, and contact notifications are handled on your machine locally or require option B.

### Step-by-Step GitHub Pages Setup:

#### 1. Push to GitHub
1.  Initialize git if not already done:
    ```bash
    git init
    git add .
    git commit -m "feat: migrate and prepare for github pages"
    ```
2.  Create a blank repository on [GitHub](https://github.com) named `simply-comical-portfolio` (do not add any README or license).
3.  Link and push your local copy:
    ```bash
    git remote add origin https://github.com/YOUR_USERNAME/simply-comical-portfolio.git
    git branch -M main
    git push -u origin main
    ```

#### 2. Auto-Deploy via GitHub Actions (Highly Recommended)
We have added an automated deployment recipe inside `.github/workflows/deploy.yml`. When you push updates to GitHub, the action compiles the React app and publishes it within 1 minute!
1.  On GitHub, navigate to your repository settings (**Settings** > **Pages**).
2.  Under **Build and deployment** > **Source**, change from **Deploy from a branch** to **GitHub Actions**.
3.  Go to the **Actions** tab of your repository to view the build pipeline. Your live link will look like: 
    `https://YOUR_USERNAME.github.io/simply-comical-portfolio/`

---

## ⚡ Option B: Splitting Frontend (Static) & Back-End (Full-Stack)

To keep all administrative editors, dynamic reviews, image upload drag-and-drops, and nodemailer dispatch forms fully active, configure a dedicated, inexpensive backend.

### 1. Build and Host the Node.js Express Backend
You can deploy your dynamic backend on [Render](https://render.com) or [Railway](https://railway.app):
1.  Log in to **Render** and click **New** > **Web Service**.
2.  Connect your GitHub repository.
3.  Select the following configuration properties:
    *   **Runtime**: `Node`
    *   **Build Command**: `npm install && npm run build` (This compiles both frontend static folders and bundles `server.ts` into a fast `dist/server.cjs` file)
    *   **Start Command**: `npm start`
4.  Add environment variables in Render's **Environment** tab:
    *   `NODE_ENV`: `production`
    *   `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (Optional, for inquiries emails)
5.  Click **Deploy**. Render will host the backend and give you a URL like: `https://comical-api.onrender.com`.

### 2. Connect your Static Frontend
Now, tell GitHub Pages or Cloudflare Pages where to locate your newly deployed back-end:
1.  On **Cloudflare Pages** or in your local environment, specify the environment variable during build:
    ```env
    VITE_API_URL=https://comical-api.onrender.com
    ```
2.  Redeploy the static client! The React app on GitHub Pages will now dynamically routes logins, edits, and contact forms to your secure back-end.

---

## 🌐 Linking a Custom Domain (GoDaddy Steps)

To point a custom domain like `preethambharadwaj.com` to your new host, follow these precise GoDaddy DNS layout directions:

### Step 1: Tell your Hosting Provider
*   **For GitHub Pages**: Go to **Settings** > **Pages** > **Custom Domain** box, type `preethambharadwaj.com` (or `www.preethambharadwaj.com`), and hit **Save**.
*   **For Cloudflare Pages**: Go to **Pages** > **Custom Domains** > **Set up a Custom Domain**, type your domain, and continue.

### Step 2: Configure Domain Registries inside GoDaddy
1.  Log into your **GoDaddy Control Center**, search for your domain `preethambharadwaj.com`, and click **DNS Manage** / **DNS Templates**.
2.  Look for any old placeholder **A Records** (e.g. `34.102.136.193` or GoDaddy's parking IP) and **DELETE** them to prevent domain hijacking or conflicting redirects.
3.  Add the target routing records in the records table:

#### For GitHub Pages Apex Routing:
Click **Add New Record** and complete the following A-records:

| Type | Name (Host) | Value | TTL |
| :--- | :--- | :--- | :--- |
| **A** | `@` | `185.199.108.153` | `1 Hour` (or Default) |
| **A** | `@` | `185.199.109.153` | `1 Hour` |
| **A** | `@` | `185.199.110.153` | `1 Hour` |
| **A** | `@` | `185.199.111.153` | `1 Hour` |

#### For WWW CNAME Redirects:
Ensure your `www` subdomain connects smoothly to your GitHub username:

| Type | Name (Host) | Value | TTL |
| :--- | :--- | :--- | :--- |
| **CNAME** | `www` | `YOUR_USERNAME.github.io.` | `1 Hour` |

*(Note the trailing dot at the end of the CNAME target value! Some registrars require it, others add it automatically)*

4.  Wait 15–30 minutes for DNS servers to propagate the change internationally. You can check search propagation status at [dnschecker.org](https://dnschecker.org).

---

## 🛠️ Local Development & Operations

To test both client-side design layers and fullstack synchronizations on your workstation:

```bash
# 1. Install all dependencies
npm install

# 2. Boot dev environment (Runs Vite dev proxy and express port 3000)
npm run dev

# 3. Clean files and generate standard production package
npm run build
```
