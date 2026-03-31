# Deployment Guide for The Pitch Visualizer 🚀

Deploying this FastAPI server is extremely straightforward, as long as you provide the cloud environment your 2 API Keys.

Here are the simplest, most popular methods to deploy the project online for free.

## Option 1: Deploy on Render.com (Recommended)
Render natively supports Python and makes the deployment process seamless via GitHub.

1. **Push to GitHub**: Make sure you have pushed all this code to a public or private GitHub repository.
2. **Create Account**: Head over to [Render](https://render.com) and sign up/login.
3. **New Web Service**: Click "New" -> "Web Service".
4. **Connect Git Repo**: Connect your GitHub account and select the repository you pushed.
5. **Configure Details**:
   - **Environment**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app -w 4 -k uvicorn.workers.UvicornWorker`
6. **Set Environment Variables**: In the Render settings panel (before saving!), click "Advanced" and add your API keys manually (do *not* upload your `.env` file!):
   - Key: `GEMINI_API_KEY` | Value: `your-gemini-key`
   - Key: `HUGGINGFACE_API_KEY` | Value: `your-hf-token`
7. Click **Create Web Service**. Render will deploy it instantly!

## Option 2: Deploy on Vercel
Vercel is traditionally for frontend frameworks but supports Serverless Python easily out of the box with `vercel.json`.

1. **Install Vercel CLI**: Create a free Vercel account and install the CLI globally: `npm i -g vercel`.
2. **Configuration File**: Add a `vercel.json` file to the root of your directory with the following contents:
```json
{
  "builds": [
    {
      "src": "app.py",
      "use": "@vercel/python"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "app.py"
    }
  ]
}
```
3. **Deploy from CLI**: In your terminal inside the project, run:
```bash
vercel
```
4. **Environment Variables**: Head into the Vercel dashboard and add your `GEMINI_API_KEY` and `HUGGINGFACE_API_KEY` via "Project Settings" -> "Environment Variables", then hit Redeploy!

## Option 3: Deploy on Railway.app
If you prefer pure Docker or straightforward un-configured deploys, Railway works very well.

1. Go to [Railway.app](https://railway.app/).
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Choose your repo.
4. Add the `GEMINI_API_KEY` and `HUGGINGFACE_API_KEY` variables to the "Variables" tab.
5. Railway handles the web process generation natively looking at `requirements.txt`.
6. Grab the automatically generated public URL!
