# Gymmy website + backend

This folder is the full Gymmy site. One small server stores accounts, bookings, and contact messages so they work for every member, not just one browser.

## What you need (one-time)

1. Install Node.js LTS from https://nodejs.org (the big LTS button).
2. Unzip this folder somewhere on your computer.

## Start the site

Open a terminal in this folder and run:

```
npm install
npm start
```

Then open a browser to:

**http://localhost:3000**

Leave the terminal window open while the site is running.

## Admin login

- Username: `Admin`
- Password: `4609295Jg?`

Use the Admin tab to create member accounts. Members cannot create their own accounts.

## How it works

- All public pages (Home, About, Membership, Simulators, Contact) are served by the same server.
- Member Login talks to `/api/...` endpoints.
- Passwords are stored hashed, not as plain text.
- Bookings are shared. If Bay 3 is taken 4–6 PM, that slot is hidden for everyone.
- Peak hours (7 AM–7 PM) count toward each member’s 21 hours per month.
- Contact form messages are saved on the server. Admin can see them under Admin → Messages.

## Going live on the internet

`localhost` only works on that computer. To put it on the web:

1. Create a free account at [Railway](https://railway.app) or [Render](https://render.com).
2. Upload this folder (or connect a GitHub repo).
3. Set start command to `npm start`.
4. They will give you a public URL.

If you want a custom domain later (gymmy.com), point it at that host.

## Files

- `server.js` — backend
- `data/store.json` — created automatically (users, bookings, messages)
- `public/` — the website pages
