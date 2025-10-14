#!/bin/bash

# Load environment variables from .env file
source .env

# Validate Google API settings
if [ -z "$REACT_APP_GOOGLE_CLIENT_ID" ] || [ -z "$REACT_APP_GOOGLE_CLIENT_SECRET" ] || [ -z "$REACT_APP_GOOGLE_REDIRECT_URI" ]; then
  echo "Google API settings are missing in .env file."
else
  echo "Validating Google API settings..."
  AUTH_CODE="4/0AVGzR1C1f9-Lu9Rlx3Sm2SThVKAd9MmAozECKtxdSkgyiI1mx-DryqRR67zsQsjfOhkzHg" # Replace with actual authorization code
  RESPONSE=$(curl -X POST https://oauth2.googleapis.com/token \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "code=$AUTH_CODE" \
    -d "client_id=$REACT_APP_GOOGLE_CLIENT_ID" \
    -d "client_secret=$REACT_APP_GOOGLE_CLIENT_SECRET" \
    -d "redirect_uri=$REACT_APP_GOOGLE_REDIRECT_URI" \
    -d "grant_type=authorization_code")
  echo "Response: $RESPONSE"
fi

# Validate Gemini API settings
if [ -z "$REACT_APP_GEMINI_API_KEY" ]; then
  echo "Gemini API key is missing in .env file."
else
  echo "Validating Gemini API settings..."
  curl -I "https://api.gemini.com/v1/status?api_key=$REACT_APP_GEMINI_API_KEY" -o /dev/null -w "%{http_code}\n" -s
fi

# End of script