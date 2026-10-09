# Font Recognizer

A web application that identifies fonts and extracts color codes from uploaded images.

## Features

- **Font Recognition**: Upload an image containing text and identify the font used
- **Color Extraction**: Automatically extracts dominant colors and their hex codes
- **Click-to-Copy**: Easily copy hex color codes to your clipboard
- **Drag & Drop**: Simple drag-and-drop image upload interface

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure API Key

Sign up for a free API key at [WhatFontIs](https://www.whatfontis.com/API-identify-fonts-from-image.html) (200 free requests/day).

Copy `.env.example` to `.env` and add your key:

```bash
cp .env.example .env
```

Edit `.env`:
```
WHATFONTIS_API_KEY=your_actual_api_key
```

### 3. Run the App

```bash
python app.py
```

Open your browser to `http://localhost:5000`

## How It Works

1. **Upload** an image with text via drag-and-drop or file picker
2. **Color Extraction** runs client-side using the Canvas API to find dominant colors
3. **Font Identification** sends the image to the WhatFontIs API via the Flask backend
4. **Results** display the identified font(s) with similarity scores and extracted hex color codes

## Tech Stack

- **Backend**: Python / Flask
- **Font API**: WhatFontIs (free tier)
- **Color Analysis**: JavaScript Canvas API
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
