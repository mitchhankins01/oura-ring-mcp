#!/bin/bash
# Update Oura OpenAPI spec by scraping the download link from docs page
set -e

DOCS_URL="https://cloud.ouraring.com/v2/docs"
BASE_URL="https://cloud.ouraring.com"

echo "📄 Fetching Oura API docs page..."
DOCS_HTML=$(curl -sL "$DOCS_URL")

echo "🔍 Extracting OpenAPI spec download link..."
# Look for link containing "openapi" and ending in .json
SPEC_PATH=$(echo "$DOCS_HTML" | grep -o '/v2/static/json/openapi-[0-9.]*\.json' | head -1)

if [ -z "$SPEC_PATH" ]; then
  echo "❌ Error: Could not find OpenAPI spec download link"
  echo "The docs page structure may have changed."
  echo "Please manually download from: $DOCS_URL"
  exit 1
fi

SPEC_URL="${BASE_URL}${SPEC_PATH}"
VERSION=$(echo "$SPEC_PATH" | grep -o '[0-9.]*' | head -1)

echo "📥 Downloading OpenAPI spec v${VERSION}..."
echo "    URL: $SPEC_URL"

if ! curl -fsSL "$SPEC_URL" -o oura-openapi.json; then
  echo "❌ Error: Failed to download OpenAPI spec"
  exit 1
fi

FILE_SIZE=$(wc -c < oura-openapi.json | tr -d ' ')
echo "✅ Successfully downloaded OpenAPI spec v${VERSION} (${FILE_SIZE} bytes)"
echo "📝 Run 'pnpm generate-types' to regenerate TypeScript types"
