# Workley OAuth Integration Setup Guide

This guide walks you through setting up real Google OAuth (and preparing for Apple Sign-In) on your Workley site.

## Step 1: Get a Google Client ID (you're here)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google+ API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Choose **Web application**
6. Under **Authorized JavaScript origins**, add:
   ```
   http://localhost:8000
   ```
   (If deploying to production, also add your domain, e.g. `https://workley.co.za`)

7. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:8000/oauth-callback.html
   ```
   (Update to your production URL when you deploy)

8. Click **Create** and copy the **Client ID** (looks like `xxxxx.apps.googleusercontent.com`)

---

## Step 2: Add Your Client ID to app.js

Open `js/app.js` and find this section near the top:

```javascript
const OAUTH_CONFIG = {
  GOOGLE_CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID_HERE',
};
```

Replace `YOUR_GOOGLE_CLIENT_ID_HERE` with the Client ID from Step 1:

```javascript
const OAUTH_CONFIG = {
  GOOGLE_CLIENT_ID: '123456789.apps.googleusercontent.com',  // your actual ID
};
```

Save the file.

---

## Step 3: Test Locally

1. Open terminal and navigate to your site folder:
   ```bash
   cd ispani_site
   python3 -m http.server 8000
   ```

2. Open http://localhost:8000 in your browser

3. Click **"Join free"** or **"Log in"** and try **"Continue with Google"**

You should be redirected to Google's login. After signing in, you'll be sent to `oauth-callback.html`, which shows the authorization code.

---

## Step 4: Connect Your Backend (the Critical Part)

**This is where real authentication happens.** The current flow redirects to Google and gets a code, but does nothing with it. You need a backend server to:

1. **Exchange the code for a token** - send the code to Google's token endpoint with your Client Secret
2. **Fetch the user's profile** - use the token to get name, email, photo
3. **Create/find the user** - store them in your database
4. **Return a session** - send back a JWT or session token

### Example (ASP.NET Core backend):

In your backend, create an endpoint like `POST /api/auth/google/callback`:

```csharp
[HttpPost("google/callback")]
public async Task<IActionResult> GoogleCallback([FromBody] GoogleCallbackRequest req)
{
    // Exchange code for token using GoogleAuthorizationCodeFlow
    var token = await ExchangeCodeForToken(req.Code);
    
    // Fetch user info from Google
    var userInfo = await GetGoogleUserInfo(token.AccessToken);
    
    // Create or find user in DB
    var user = await _userService.FindOrCreateUser(userInfo.Email, userInfo.Name);
    
    // Generate your own session/JWT
    var sessionToken = _authService.GenerateToken(user);
    
    return Ok(new { user = user, token = sessionToken });
}
```

### Then update your frontend (`oauth-callback.html`):

Uncomment and point to your backend:

```javascript
const backendExchange = async () => {
  const backendUrl = 'https://your-api.com/api/auth/google/callback';  // ← your endpoint
  const response = await fetch(backendUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, state })
  });
  
  const data = await response.json();
  
  // Store your session token
  localStorage.setItem('workley_token', data.token);
  localStorage.setItem('workley_user', JSON.stringify(data.user));
  
  // Redirect to home
  window.location.href = '/';
};

backendExchange();  // ← uncomment this
```

---

## Step 5: Apple Sign-In (Future)

Apple Sign-In works similarly but requires:
- A backend to handle the secret key exchange (more secure than Google's flow)
- An Apple Developer account + Team ID
- [Follow Apple's guide](https://developer.apple.com/sign-in-with-apple/get-started/)

For now, the app shows "Coming soon" - you can implement Google first.

---

## Security Notes

- **Never expose your Client Secret** in the browser - always exchange the code on your backend
- Use HTTPS in production (even `localhost` is okay for development)
- Store session tokens securely (HttpOnly cookies are best, not localStorage)
- Validate the `state` parameter in your callback to prevent CSRF
- Refer to the `Workley-security-and-POPIA-spec.md` for full details

---

## Troubleshooting

**"OAuth_CONFIG.GOOGLE_CLIENT_ID is undefined"** → You haven't added your Client ID to app.js yet.

**"Redirect URI mismatch"** → The URL in your Google Console doesn't match where the browser is. Make sure you added `http://localhost:8000/oauth-callback.html` (exact match).

**"Backend call fails"** → You don't have a backend yet. For now, just test the Google redirect flow. Come back to this once your ASP.NET Core backend is ready.

**"CORS error"** → Your backend needs to allow requests from `localhost:8000` (in production, your domain). Add the appropriate CORS headers.

