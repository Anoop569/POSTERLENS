// ===== Font Recognizer - Main Application Script =====

(function () {
    'use strict';

    // --- DOM Elements ---
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const uploadSection = document.getElementById('uploadSection');
    const resultsSection = document.getElementById('resultsSection');
    const previewImg = document.getElementById('previewImg');
    const loadingCard = document.getElementById('loadingCard');
    const fontResultsCard = document.getElementById('fontResultsCard');
    const colorResultsCard = document.getElementById('colorResultsCard');
    const errorCard = document.getElementById('errorCard');
    const errorMessage = document.getElementById('errorMessage');
    const fontList = document.getElementById('fontList');
    const fontCount = document.getElementById('fontCount');
    const colorGrid = document.getElementById('colorGrid');
    const colorCount = document.getElementById('colorCount');
    const resetBtn = document.getElementById('resetBtn');
    const demoBanner = document.getElementById('demoBanner');
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    // --- State ---
    let currentFile = null;

    // ===== Upload Handling =====

    // Click to upload
    uploadZone.addEventListener('click', () => fileInput.click());

    // File selected via picker
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleFile(file);
    });

    // Drag and drop
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
    });

    uploadZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            handleFile(file);
        }
    });

    // Prevent default drag behavior on the document
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => e.preventDefault());

    // Reset button
    resetBtn.addEventListener('click', resetApp);

    // ===== Core Functions =====

    function handleFile(file) {
        // Validate file type
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
        if (!validTypes.includes(file.type)) {
            showError('Please upload a valid image file (JPG, PNG, GIF, WebP, or BMP).');
            return;
        }

        // Validate file size (10MB)
        if (file.size > 10 * 1024 * 1024) {
            showError('Image is too large. Maximum size is 10MB.');
            return;
        }

        currentFile = file;

        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImg.src = e.target.result;
            showResults();
            analyzeImage(file, e.target.result);
        };
        reader.readAsDataURL(file);
    }

    function showResults() {
        uploadSection.style.display = 'none';
        resultsSection.style.display = 'block';
        loadingCard.style.display = 'block';
        fontResultsCard.style.display = 'none';
        colorResultsCard.style.display = 'none';
        errorCard.style.display = 'none';
    }

    async function analyzeImage(file, dataUrl) {
        // Run color extraction and font identification in parallel
        const colorsPromise = extractColors(dataUrl);
        const fontsPromise = identifyFont(file);

        try {
            const colors = await colorsPromise;
            displayColors(colors);
        } catch (err) {
            console.error('Color extraction failed:', err);
        }

        try {
            const fontData = await fontsPromise;
            displayFonts(fontData);
        } catch (err) {
            showError(err.message || 'Failed to identify font. Please try again.');
        }

        loadingCard.style.display = 'none';
    }

    // ===== Color Extraction =====

    function extractColors(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const colors = getColorsFromImage(img);
                    resolve(colors);
                } catch (err) {
                    reject(err);
                }
            };
            img.onerror = reject;
            img.src = dataUrl;
        });
    }

    function getColorsFromImage(img) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Scale down for performance
        const maxDim = 200;
        let width = img.naturalWidth;
        let height = img.naturalHeight;
        const scale = Math.min(maxDim / width, maxDim / height, 1);
        width = Math.floor(width * scale);
        height = Math.floor(height * scale);

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, width, height).data;

        // Sample pixels
        const pixels = [];
        const step = 4; // Sample every 4th pixel for speed
        for (let i = 0; i < imageData.length; i += 4 * step) {
            const r = imageData[i];
            const g = imageData[i + 1];
            const b = imageData[i + 2];
            const a = imageData[i + 3];

            // Skip fully transparent pixels
            if (a < 128) continue;

            // Skip near-white and near-black (often backgrounds)
            // But still include them in a secondary pass
            pixels.push([r, g, b]);
        }

        // K-Means clustering to find dominant colors
        const k = 8;
        const clusters = kMeansClustering(pixels, k, 15);

        // Sort by cluster size (most dominant first)
        clusters.sort((a, b) => b.count - a.count);

        // Convert to hex and filter near-duplicates
        const results = [];
        const seen = new Set();

        for (const cluster of clusters) {
            const r = Math.round(cluster.center[0]);
            const g = Math.round(cluster.center[1]);
            const b = Math.round(cluster.center[2]);
            const hex = rgbToHex(r, g, b);

            // Skip if too similar to an already added color
            if (seen.has(hex)) continue;

            let tooSimilar = false;
            for (const existing of results) {
                if (colorDistance([r, g, b], hexToRgb(existing.hex)) < 30) {
                    tooSimilar = true;
                    break;
                }
            }
            if (tooSimilar) continue;

            seen.add(hex);
            results.push({
                hex: hex,
                rgb: { r, g, b },
                percentage: ((cluster.count / pixels.length) * 100).toFixed(1)
            });

            if (results.length >= 8) break;
        }

        return results;
    }

    // K-Means clustering
    function kMeansClustering(pixels, k, maxIterations) {
        if (pixels.length === 0) return [];
        k = Math.min(k, pixels.length);

        // Initialize centers using random pixels
        const centers = [];
        const usedIndices = new Set();
        while (centers.length < k) {
            const idx = Math.floor(Math.random() * pixels.length);
            if (!usedIndices.has(idx)) {
                usedIndices.add(idx);
                centers.push([...pixels[idx]]);
            }
        }

        let assignments = new Array(pixels.length).fill(0);

        for (let iter = 0; iter < maxIterations; iter++) {
            // Assign pixels to nearest center
            let changed = false;
            for (let i = 0; i < pixels.length; i++) {
                let minDist = Infinity;
                let nearest = 0;
                for (let j = 0; j < k; j++) {
                    const dist = colorDistance(pixels[i], centers[j]);
                    if (dist < minDist) {
                        minDist = dist;
                        nearest = j;
                    }
                }
                if (assignments[i] !== nearest) {
                    assignments[i] = nearest;
                    changed = true;
                }
            }

            if (!changed) break;

            // Recalculate centers
            const sums = Array.from({ length: k }, () => [0, 0, 0]);
            const counts = new Array(k).fill(0);

            for (let i = 0; i < pixels.length; i++) {
                const c = assignments[i];
                sums[c][0] += pixels[i][0];
                sums[c][1] += pixels[i][1];
                sums[c][2] += pixels[i][2];
                counts[c]++;
            }

            for (let j = 0; j < k; j++) {
                if (counts[j] > 0) {
                    centers[j] = [
                        sums[j][0] / counts[j],
                        sums[j][1] / counts[j],
                        sums[j][2] / counts[j]
                    ];
                }
            }
        }

        // Build result clusters
        const clusters = centers.map((center, i) => ({
            center,
            count: 0
        }));

        for (const assignment of assignments) {
            clusters[assignment].count++;
        }

        return clusters.filter(c => c.count > 0);
    }

    // ===== Color Utilities =====

    function colorDistance(c1, c2) {
        return Math.sqrt(
            Math.pow(c1[0] - c2[0], 2) +
            Math.pow(c1[1] - c2[1], 2) +
            Math.pow(c1[2] - c2[2], 2)
        );
    }

    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
    }

    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16),
            parseInt(result[2], 16),
            parseInt(result[3], 16)
        ] : [0, 0, 0];
    }

    // ===== Font Identification =====

    async function identifyFont(file) {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch('/api/identify', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok && !data.fonts) {
            throw new Error(data.error || 'Failed to identify font.');
        }

        return data;
    }

    // ===== Display Functions =====

    function displayFonts(data) {
        fontList.innerHTML = '';

        if (data.demo_mode) {
            demoBanner.style.display = 'flex';
        } else {
            demoBanner.style.display = 'none';
        }

        const fonts = data.fonts || [];

        if (fonts.length === 0) {
            fontList.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 1rem;">No fonts could be identified. Try with a clearer image containing larger text.</p>';
            fontCount.textContent = '0 fonts';
        } else {
            fontCount.textContent = `${fonts.length} font${fonts.length !== 1 ? 's' : ''}`;

            fonts.forEach((font, index) => {
                const item = document.createElement('div');
                item.className = 'font-item';
                item.style.animationDelay = `${index * 0.08}s`;

                const licenseClass = font.is_free ? 'free-badge' : 'commercial-badge';
                const licenseText = font.is_free ? 'Free' : 'Commercial';
                const similarity = font.similarity || 0;

                item.innerHTML = `
                    <div class="font-info">
                        <div class="font-name">${escapeHtml(font.title)}</div>
                        <div class="font-author">by ${escapeHtml(font.author || 'Unknown')}</div>
                    </div>
                    <div class="font-meta">
                        <span class="similarity-badge">${similarity}%</span>
                        <span class="${licenseClass}">${licenseText}</span>
                        ${font.url && font.url !== '#' ? `
                        <a href="${escapeHtml(font.url)}" target="_blank" rel="noopener" class="font-link" title="View font">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                <polyline points="15 3 21 3 21 9"/>
                                <line x1="10" y1="14" x2="21" y2="3"/>
                            </svg>
                        </a>` : ''}
                    </div>
                `;

                fontList.appendChild(item);
            });
        }

        fontResultsCard.style.display = 'block';
    }

    function displayColors(colors) {
        colorGrid.innerHTML = '';

        if (colors.length === 0) {
            colorGrid.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 1rem; grid-column: 1/-1;">Could not extract colors from this image.</p>';
            colorCount.textContent = '0 colors';
        } else {
            colorCount.textContent = `${colors.length} color${colors.length !== 1 ? 's' : ''}`;

            colors.forEach((color, index) => {
                const swatch = document.createElement('div');
                swatch.className = 'color-swatch';
                swatch.style.animationDelay = `${index * 0.06}s`;
                swatch.title = `Click to copy ${color.hex}`;

                swatch.innerHTML = `
                    <div class="color-preview" style="background-color: ${color.hex};"></div>
                    <div class="color-info">
                        <div class="color-hex">${color.hex}</div>
                        <div class="color-rgb">RGB(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b})</div>
                    </div>
                `;

                swatch.addEventListener('click', () => {
                    copyToClipboard(color.hex);
                });

                colorGrid.appendChild(swatch);
            });
        }

        colorResultsCard.style.display = 'block';
    }

    // ===== Utility Functions =====

    function showError(message) {
        loadingCard.style.display = 'none';
        fontResultsCard.style.display = 'none';
        colorResultsCard.style.display = 'none';
        errorMessage.textContent = message;
        errorCard.style.display = 'block';
    }

    function resetApp() {
        currentFile = null;
        fileInput.value = '';
        previewImg.src = '';
        fontList.innerHTML = '';
        colorGrid.innerHTML = '';

        resultsSection.style.display = 'none';
        uploadSection.style.display = 'block';

        loadingCard.style.display = 'none';
        fontResultsCard.style.display = 'none';
        colorResultsCard.style.display = 'none';
        errorCard.style.display = 'none';
        demoBanner.style.display = 'none';
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            showToast(`Copied ${text}`);
        }).catch(() => {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showToast(`Copied ${text}`);
        });
    }

    function showToast(message) {
        toastMessage.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2000);
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

})();
