#!/bin/bash

# Load environment variables from .env file
source .env

# Validate Google API settings
if [ -z "$REACT_APP_GOOGLE_CLIENT_ID" ] || [ -z "$REACT_APP_GOOGLE_API_KEY" ]; then
  echo "Google API settings are missing in .env file."
else
  echo "Validating Google API settings..."
  curl -I "https://www.googleapis.com/oauth2/v3/tokeninfo?client_id=$REACT_APP_GOOGLE_CLIENT_ID" -o /dev/null -w "%{http_code}\n" -s
fi

# Validate Gemini API settings
if [ -z "$REACT_APP_GEMINI_API_KEY" ]; then
  echo "Gemini API key is missing in .env file."
else
  echo "Validating Gemini API settings..."
  curl -I "https://api.gemini.com/v1/status?api_key=$REACT_APP_GEMINI_API_KEY" -o /dev/null -w "%{http_code}\n" -s
fi

# End of script