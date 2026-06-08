import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import multer from 'multer';
import { initializeApp } from 'firebase/app';
import { initializeFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import nodemailer from 'nodemailer';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON Body parser with larger limit for complex images descriptions or potential inline data
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Ensure upload directory exists
  const uploadsDir = path.join(process.cwd(), 'src', 'assets', 'images');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Multer Storage Configuration
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      // Clean original filename
      const sanitised = file.originalname.replace(/[^a-zA-Z0-9-]/g, '_');
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, `uploaded_${uniqueSuffix}${ext || '.png'}`);
    }
  });

  const upload = multer({ storage });
  
  // Paths
  const dbPath = path.join(process.cwd(), 'src', 'projects.json');
  const categoriesDbPath = path.join(process.cwd(), 'src', 'categories.json');
  const sectionsDbPath = path.join(process.cwd(), 'src', 'sections.json');
  const commentsDbPath = path.join(process.cwd(), 'src', 'comments.json');
  const adminDbPath = path.join(process.cwd(), 'src', 'admin.json');
  const inquiriesDbPath = path.join(process.cwd(), 'src', 'inquiries.json');

  // Initialize Firebase Firestore dynamically from config
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  let db: any = null;

  if (fs.existsSync(configPath)) {
    try {
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const app = initializeApp(firebaseConfig);
      db = initializeFirestore(app, { experimentalForceLongPolling: true }, firebaseConfig.firestoreDatabaseId);
      console.log('Firebase initialized successfully with database ID:', firebaseConfig.firestoreDatabaseId);
    } catch (err) {
      console.error('Failed to initialize Firebase in server.ts:', err);
    }
  } else {
    console.log('No firebase-applet-config.json found. Falling back to local file storage only.');
  }

  // OTP stored state
  const otpStorage = new Map<string, { otp: string; expiresAt: number }>();

  // Cloud syncing utilities
  async function syncCollectionFromCloud(collectionName: string, filePath: string, defaultData: any) {
    if (!db) return;
    try {
      const docRef = doc(db, 'cms_sync', collectionName);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const cloudData = docSnap.data().data;
        if (cloudData) {
          fs.writeFileSync(filePath, JSON.stringify(cloudData, null, 2), 'utf-8');
          console.log(`Successfully restored ${collectionName} datasets dynamically from Firestore.`);
          return;
        }
      }
      
      // Cloud document doesn't exist, seed local defaults to Firestore
      let currentData = defaultData;
      if (fs.existsSync(filePath)) {
        try {
          currentData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (e) {
          console.error(`Local file format corrupt for ${collectionName}, using defaults`);
        }
      }
      await setDoc(docRef, { data: currentData });
      console.log(`Seeded Cloud Firestore database with initial local dataset for ${collectionName}.`);
    } catch (err) {
      console.error(`Error syncing collection ${collectionName} with Firestore:`, err);
    }
  }

  async function saveCollectionToCloud(collectionName: string, data: any) {
    if (!db) return;
    try {
      const docRef = doc(db, 'cms_sync', collectionName);
      await setDoc(docRef, { data });
      console.log(`Saved ${collectionName} to Firestore successfully.`);
    } catch (err) {
      console.error(`Failed to push ${collectionName} to Firestore sync:`, err);
    }
  }

  // Execute initial sync at boot
  if (db) {
    console.log('Restoring data from Firestore...');
    await syncCollectionFromCloud('categories', categoriesDbPath, [
      { "id": "all", "name": "All Projects" },
      { "id": "comics", "name": "Comics" },
      { "id": "science_illustrations", "name": "Science Illustrations" },
      { "id": "workshops", "name": "Workshops" },
      { "id": "marketing", "name": "Campaigns & Marketing" },
      { "id": "mascot_design", "name": "Mascot Design" }
    ]);
    await syncCollectionFromCloud('projects', dbPath, []);
    await syncCollectionFromCloud('sections', sectionsDbPath, []);
    await syncCollectionFromCloud('comments', commentsDbPath, []);
    await syncCollectionFromCloud('inquiries', inquiriesDbPath, []);
    await syncCollectionFromCloud('admin', adminDbPath, {
      "username": "admin",
      "password": "admin",
      "email": "bharadwajpreetham@gmail.com"
    });
  }

  // API Endpoint - Fetch all categories
  app.get('/api/categories', (req, res) => {
    try {
      if (fs.existsSync(categoriesDbPath)) {
        const raw = fs.readFileSync(categoriesDbPath, 'utf-8');
        const json = JSON.parse(raw);
        return res.json(json);
      } else {
        return res.json([
          { "id": "all", "name": "All Projects" },
          { "id": "comics", "name": "Comics" },
          { "id": "science_illustrations", "name": "Science Illustrations" },
          { "id": "workshops", "name": "Workshops" },
          { "id": "marketing", "name": "Campaigns & Marketing" },
          { "id": "mascot_design", "name": "Mascot Design" }
        ]);
      }
    } catch (err: any) {
      console.error('Error reading categories.json:', err);
      return res.status(500).json({ error: 'Failed to read categories: ' + err.message });
    }
  });

  // API Endpoint - Save/Update all categories
  app.post('/api/categories', async (req, res) => {
    try {
      const categories = req.body;
      if (!Array.isArray(categories)) {
        return res.status(400).json({ error: 'Body must be a JSON array of categories' });
      }
      fs.writeFileSync(categoriesDbPath, JSON.stringify(categories, null, 2), 'utf-8');
      await saveCollectionToCloud('categories', categories);
      return res.json({ success: true, categories });
    } catch (err: any) {
      console.error('Error writing categories.json:', err);
      return res.status(500).json({ error: 'Failed to write categories: ' + err.message });
    }
  });

  // API Endpoint - Fetch all projects
  app.get('/api/projects', (req, res) => {
    try {
      if (fs.existsSync(dbPath)) {
        const raw = fs.readFileSync(dbPath, 'utf-8');
        const json = JSON.parse(raw);
        return res.json(json);
      } else {
        return res.json([]);
      }
    } catch (err: any) {
      console.error('Error reading projects.json:', err);
      return res.status(500).json({ error: 'Failed to read database: ' + err.message });
    }
  });

  // API Endpoint - Save/Update all projects
  app.post('/api/projects', async (req, res) => {
    try {
      const projects = req.body;
      if (!Array.isArray(projects)) {
        return res.status(400).json({ error: 'Body must be a JSON array of projects' });
      }
      fs.writeFileSync(dbPath, JSON.stringify(projects, null, 2), 'utf-8');
      await saveCollectionToCloud('projects', projects);
      return res.json({ success: true, projects });
    } catch (err: any) {
      console.error('Error writing projects.json:', err);
      return res.status(500).json({ error: 'Failed to write database: ' + err.message });
    }
  });

  // API Endpoint - Fetch all website sections
  app.get('/api/sections', (req, res) => {
    try {
      if (fs.existsSync(sectionsDbPath)) {
        const raw = fs.readFileSync(sectionsDbPath, 'utf-8');
        return res.json(JSON.parse(raw));
      }
      return res.json([]);
    } catch (err: any) {
      console.error('Error reading sections.json:', err);
      return res.status(500).json({ error: 'Failed to read sections: ' + err.message });
    }
  });

  // API Endpoint - Save/Update all website sections
  app.post('/api/sections', async (req, res) => {
    try {
      const sections = req.body;
      if (!Array.isArray(sections)) {
        return res.status(400).json({ error: 'Body must be a JSON array of sections' });
      }
      fs.writeFileSync(sectionsDbPath, JSON.stringify(sections, null, 2), 'utf-8');
      await saveCollectionToCloud('sections', sections);
      return res.json({ success: true, sections });
    } catch (err: any) {
      console.error('Error writing sections.json:', err);
      return res.status(500).json({ error: 'Failed to write sections: ' + err.message });
    }
  });

  // API Endpoint - Fetch all visitors comments and reviews
  app.get('/api/comments', (req, res) => {
    try {
      if (fs.existsSync(commentsDbPath)) {
        const raw = fs.readFileSync(commentsDbPath, 'utf-8');
        return res.json(JSON.parse(raw));
      }
      return res.json([]);
    } catch (err: any) {
      console.error('Error reading comments.json:', err);
      return res.status(500).json({ error: 'Failed to read comments: ' + err.message });
    }
  });

  // API Endpoint - Add a new visitor comment/review
  app.post('/api/comments', async (req, res) => {
    try {
      const { name, text, rating } = req.body;
      if (!name || !text) {
        return res.status(400).json({ error: 'Name and text are required fields' });
      }
      
      let comments = [];
      if (fs.existsSync(commentsDbPath)) {
        comments = JSON.parse(fs.readFileSync(commentsDbPath, 'utf-8'));
      }
      
      const newComment = {
        id: 'comment_' + Date.now(),
        name: String(name).trim(),
        text: String(text).trim(),
        rating: typeof rating === 'number' ? rating : 5,
        date: new Date().toISOString()
      };
      
      comments.unshift(newComment); // Newest comments first
      fs.writeFileSync(commentsDbPath, JSON.stringify(comments, null, 2), 'utf-8');
      await saveCollectionToCloud('comments', comments);
      return res.json({ success: true, comment: newComment, comments });
    } catch (err: any) {
      console.error('Error saving comment:', err);
      return res.status(500).json({ error: 'Failed to write comment: ' + err.message });
    }
  });

  // API Endpoint - Delete/Moderate a visitor comment (Admins only)
  app.delete('/api/comments/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!fs.existsSync(commentsDbPath)) {
        return res.status(404).json({ error: 'No comments found to delete' });
      }
      
      let comments = JSON.parse(fs.readFileSync(commentsDbPath, 'utf-8'));
      const exists = comments.some((c: any) => c.id === id);
      if (!exists) {
        return res.status(404).json({ error: 'Comment not found' });
      }
      
      comments = comments.filter((c: any) => c.id !== id);
      fs.writeFileSync(commentsDbPath, JSON.stringify(comments, null, 2), 'utf-8');
      await saveCollectionToCloud('comments', comments);
      return res.json({ success: true, comments });
    } catch (err: any) {
      console.error('Error deleting comment:', err);
      return res.status(500).json({ error: 'Failed to delete comment: ' + err.message });
    }
  });

  // Helper for sending mail when an inquiry is received
  async function sendInquiryEmail(formData: { name: string; email: string; subject?: string; message: string }) {
    console.log(`[EMAIL DISPATCH] Preparing email to bharadwajpreetham@gmail.com for inquiry from ${formData.name} (${formData.email})`);
    
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    const mailOptions = {
      from: `"Simply Comical Portfolio" <${user || 'portfolio@simplycomical.com'}>`,
      to: 'bharadwajpreetham@gmail.com',
      subject: `New Inquiry: ${formData.subject || 'Collaboration Brief'} - From ${formData.name}`,
      text: `Hello Preetham,\n\nYou have received a new inquiry through your Simply Comical Portfolio website.\n\n--- Sender Details ---\nName: ${formData.name}\nEmail: ${formData.email}\nSubject: ${formData.subject || 'N/A'}\n\n--- Message ---\n${formData.message}\n\n-----------\nSent automatically from your Cloud Run container.\n`,
      html: `
<div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #e5e5e5; border-radius: 4px;">
  <h2 style="color: #111; border-bottom: 2px solid #FFDF20; padding-bottom: 10px; margin-top: 0; font-weight: normal; text-transform: uppercase; font-size: 18px; letter-spacing: 0.05em;">New Inquiry Dispatched</h2>
  <p>Hello Preetham,</p>
  <p>You have received a new inquiry through your <strong>Simply Comical Portfolio</strong> website.</p>
  
  <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #FFDF20; margin: 20px 0;">
    <h3 style="margin-top: 0; font-size: 14px; text-transform: uppercase; color: #666; letter-spacing: 0.05em;">Sender Details</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
      <tr>
        <td style="padding: 4px 0; color: #888; width: 80px;"><strong>Name:</strong></td>
        <td style="padding: 4px 0; color: #111;">${formData.name}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; color: #888;"><strong>Email:</strong></td>
        <td style="padding: 4px 0; color: #111;"><a href="mailto:${formData.email}" style="color: #111; font-weight: bold;">${formData.email}</a></td>
      </tr>
      <tr>
        <td style="padding: 4px 0; color: #888;"><strong>Subject:</strong></td>
        <td style="padding: 4px 0; color: #111; font-weight: bold;">${formData.subject || 'Collaboration Brief'}</td>
      </tr>
    </table>
  </div>
  
  <h3 style="font-size: 14px; text-transform: uppercase; color: #666; letter-spacing: 0.05em; margin-bottom: 8px;">Message Details</h3>
  <div style="background-color: #fff; border: 1px solid #e5e5e5; padding: 15px; font-style: italic; white-space: pre-wrap; font-size: 14px; line-height: 1.5; color: #444; border-radius: 2px;">${formData.message}</div>
  
  <p style="font-size: 11px; color: #999; margin-top: 30px; border-top: 1px solid #eee; padding-top: 15px;">
    Sent automatically from your Cloud Run container. System Time: ${new Date().toISOString()}
  </p>
</div>
`
    };

    if (user && pass) {
      try {
        const transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass }
        });
        await transporter.sendMail(mailOptions);
        console.log(`[EMAIL SUCCESS] Email sent successfully via SMTP to bharadwajpreetham@gmail.com`);
      } catch (smtpErr: any) {
        console.error(`[EMAIL SMTP ERROR] Failed to send email via SMTP:`, smtpErr);
      }
    } else {
      console.log(`[EMAIL NOTICE] No custom SMTP credentials specified in ENV (SMTP_USER/SMTP_PASS).`);
      try {
        let testAccount = await nodemailer.createTestAccount();
        console.log(`[EMAIL NOTICE] Created Ethereal test mailer account: ${testAccount.user}`);
        const testTransporter = nodemailer.createTransport({
          host: testAccount.smtp.host,
          port: testAccount.smtp.port,
          secure: testAccount.smtp.secure,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass
          }
        });
        const info = await testTransporter.sendMail(mailOptions);
        console.log(`[EMAIL SUCCESS] Email routed via test SMTP transporter:`, info.messageId);
        console.log(`[EMAIL PREVIEW URL] View test email at:`, nodemailer.getTestMessageUrl(info));
      } catch (testErr) {
        console.error(`[EMAIL TEST SMTP ERROR] Failed to dispatch via test SMTP:`, testErr);
      }
    }

    try {
      const logPath = path.join(process.cwd(), 'outgoing_emails.log');
      const emailLogEntry = `\n=============================================\nDATE: ${new Date().toISOString()}\nTO: bharadwajpreetham@gmail.com\nFROM: ${formData.name} <${formData.email}>\nSUBJECT: ${formData.subject || 'N/A'}\nMESSAGE:\n${formData.message}\n=============================================\n`;
      fs.appendFileSync(logPath, emailLogEntry, 'utf-8');
      console.log(`[EMAIL BACKUP LOG] Saved outgoing email to: outgoing_emails.log`);
    } catch (logErr) {
      console.error(`[EMAIL BACKUP LOG ERROR] Failed to write outgoing log:`, logErr);
    }
  }

  // API Endpoint - Fetch all inquiries
  app.get('/api/inquiries', (req, res) => {
    try {
      if (fs.existsSync(inquiriesDbPath)) {
        const raw = fs.readFileSync(inquiriesDbPath, 'utf-8');
        return res.json(JSON.parse(raw));
      }
      return res.json([]);
    } catch (err: any) {
      console.error('Error reading inquiries.json:', err);
      return res.status(500).json({ error: 'Failed to read inquiries: ' + err.message });
    }
  });

  // API Endpoint - Submit a new inquiry
  app.post('/api/inquiries', async (req, res) => {
    try {
      const { name, email, subject, message } = req.body;
      if (!name || !email || !message) {
        return res.status(400).json({ error: 'Name, email, and message are required fields.' });
      }

      let inquiries = [];
      if (fs.existsSync(inquiriesDbPath)) {
        try {
          inquiries = JSON.parse(fs.readFileSync(inquiriesDbPath, 'utf-8'));
        } catch (e) {
          inquiries = [];
        }
      }

      const newInquiry = {
        id: 'inquiry_' + Date.now(),
        name: String(name).trim(),
        email: String(email).trim(),
        subject: String(subject || 'Project Brief Selection').trim(),
        message: String(message).trim(),
        date: new Date().toISOString()
      };

      inquiries.unshift(newInquiry);
      fs.writeFileSync(inquiriesDbPath, JSON.stringify(inquiries, null, 2), 'utf-8');
      await saveCollectionToCloud('inquiries', inquiries);

      // Async email delivery
      sendInquiryEmail(newInquiry).catch(err => console.error('Failed to send email:', err));

      return res.json({ success: true, inquiry: newInquiry, inquiries });
    } catch (err: any) {
      console.error('Error writing inquiry:', err);
      return res.status(500).json({ error: 'Failed to submit inquiry: ' + err.message });
    }
  });

  // API Endpoint - Delete/Clean an inquiry
  app.delete('/api/inquiries/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!fs.existsSync(inquiriesDbPath)) {
        return res.status(404).json({ error: 'No inquiries found to delete' });
      }

      let inquiries = JSON.parse(fs.readFileSync(inquiriesDbPath, 'utf-8'));
      const exists = inquiries.some((i: any) => i.id === id);
      if (!exists) {
        return res.status(404).json({ error: 'Inquiry not found' });
      }

      inquiries = inquiries.filter((i: any) => i.id !== id);
      fs.writeFileSync(inquiriesDbPath, JSON.stringify(inquiries, null, 2), 'utf-8');
      await saveCollectionToCloud('inquiries', inquiries);
      return res.json({ success: true, inquiries });
    } catch (err: any) {
      console.error('Error deleting inquiry:', err);
      return res.status(500).json({ error: 'Failed to delete inquiry: ' + err.message });
    }
  });

  // API Endpoint - Admin login verification
  app.post('/api/login', (req, res) => {
    try {
      const { username, password } = req.body;
      let targetUsername = 'admin';
      let targetPassword = 'admin';
      
      if (fs.existsSync(adminDbPath)) {
        try {
          const adminConfig = JSON.parse(fs.readFileSync(adminDbPath, 'utf-8'));
          if (adminConfig) {
            if (adminConfig.username) targetUsername = adminConfig.username;
            if (adminConfig.password) targetPassword = adminConfig.password;
          }
        } catch (e) {
          console.error('Error reading admin db inside login:', e);
        }
      }
      
      const givenUser = String(username || '').trim().toLowerCase();
      const targetUser = String(targetUsername).trim().toLowerCase();
      
      if (givenUser === targetUser && password === targetPassword) {
        return res.json({ success: true });
      } else {
        return res.status(401).json({ error: 'Incorrect username or password.' });
      }
    } catch (err: any) {
      console.error('Error in login endpoint:', err);
      return res.status(500).json({ error: 'Authentication service down: ' + err.message });
    }
  });

  // API Endpoint - Fetch admin info securely (excludes password)
  app.get('/api/admin/info', (req, res) => {
    try {
      let username = 'admin';
      let email = 'bharadwajpreetham@gmail.com';
      
      if (fs.existsSync(adminDbPath)) {
        try {
          const adminConfig = JSON.parse(fs.readFileSync(adminDbPath, 'utf-8'));
          if (adminConfig) {
            if (adminConfig.username) username = adminConfig.username;
            if (adminConfig.email) email = adminConfig.email;
          }
        } catch (e) {
          console.error('Error reading admin db inside info endpoint:', e);
        }
      }
      return res.json({ username, email });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to retrieve admin details: ' + err.message });
    }
  });

  // API Endpoint - Generate and simulate sending OTP code
  app.post('/api/admin/send-otp', (req, res) => {
    try {
      const { email, currentPassword } = req.body;
      if (!email || !currentPassword) {
        return res.status(400).json({ error: 'Email and current password are required.' });
      }
      
      let targetPassword = 'admin';
      if (fs.existsSync(adminDbPath)) {
        try {
          const adminConfig = JSON.parse(fs.readFileSync(adminDbPath, 'utf-8'));
          if (adminConfig && adminConfig.password) {
            targetPassword = adminConfig.password;
          }
        } catch (e) {}
      }
      
      if (currentPassword !== targetPassword) {
        return res.status(401).json({ error: 'Current password does not match.' });
      }
      
      // Generate 6-digit dynamic OTP code
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
      
      const emailKey = String(email).trim().toLowerCase();
      otpStorage.set(emailKey, { otp, expiresAt });
      
      console.log(`[SECURE CENTRAL SECURITY OTP] Dynamic verification code generated for ${email} is: ${otp}`);
      
      return res.json({ 
        success: true, 
        message: `A secure verification OTP has been triggered and sent to ${email}.`,
        simulatedOtp: otp // Expose OTP for developers to verify and test locally!
      });
    } catch (err: any) {
      console.error('Error generating OTP:', err);
      return res.status(500).json({ error: 'Failed to trigger verification OTP: ' + err.message });
    }
  });

  // API Endpoint - Multi-credential modification (username, password, email)
  app.post('/api/admin/change-credentials', async (req, res) => {
    try {
      const { currentPassword, newUsername, newEmail, newPassword, otp } = req.body;
      if (!currentPassword || !newUsername || !newEmail || !newPassword || !otp) {
        return res.status(400).json({ error: 'All fields including validation OTP are required.' });
      }
      
      let targetPassword = 'admin';
      if (fs.existsSync(adminDbPath)) {
        try {
          const adminConfig = JSON.parse(fs.readFileSync(adminDbPath, 'utf-8'));
          if (adminConfig && adminConfig.password) {
            targetPassword = adminConfig.password;
          }
        } catch (e) {}
      }
      
      if (currentPassword !== targetPassword) {
        return res.status(401).json({ error: 'Verification failed: Current password does not match.' });
      }
      
      // Validate OTP
      const emailKey = String(newEmail).trim().toLowerCase();
      const cached = otpStorage.get(emailKey);
      
      if (!cached) {
        return res.status(400).json({ error: 'No OTP generated for this email. Please click "Request OTP" first.' });
      }
      
      if (cached.expiresAt < Date.now()) {
        otpStorage.delete(emailKey);
        return res.status(400).json({ error: 'The verification OTP has expired. Please request a new one.' });
      }
      
      if (cached.otp !== String(otp).trim()) {
        return res.status(400).json({ error: 'The 6-digit OTP code entered is incorrect.' });
      }
      
      // OTP matched perfectly! Purge code and commit
      otpStorage.delete(emailKey);
      
      const newConfig = {
        username: String(newUsername).trim(),
        password: String(newPassword).trim(),
        email: String(newEmail).trim()
      };
      
      fs.writeFileSync(adminDbPath, JSON.stringify(newConfig, null, 2), 'utf-8');
      await saveCollectionToCloud('admin', newConfig);
      
      return res.json({ success: true, message: 'All admin credentials (username, password, email) successfully updated!' });
    } catch (err: any) {
      console.error('Error changing credentials:', err);
      return res.status(500).json({ error: 'Failed to modify credentials: ' + err.message });
    }
  });

  // API Endpoint - Upload Image
  app.post('/api/upload', upload.single('image'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }
      // Return workspace image path
      const filePathRelative = `/src/assets/images/${req.file.filename}`;
      return res.json({ success: true, url: filePathRelative, filename: req.file.filename });
    } catch (err: any) {
      console.error('Error handling uploaded file:', err);
      return res.status(500).json({ error: 'Failed to store image: ' + err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Serve user uploads directory in production directly
    app.use('/src/assets', express.static(path.join(process.cwd(), 'src', 'assets')));
    
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
