const API_BASE = '';

let currentImages = [];
let selectedImage = null;

async function loadBatteryStatus() {
    try {
        const response = await fetch(`${API_BASE}/api/battery`);
        const data = await response.json();
        
        const batteryDiv = document.getElementById('batteryStatus');
        
        if (!data.connected) {
            batteryDiv.innerHTML = '<span class="battery-disconnected">🔌 No Battery</span>';
            return;
        }
        
        const percent = data.percent;
        const voltage = data.voltage;
        const charging = data.charging;
        
        let batteryIcon = '🔋';
        let batteryClass = 'battery-normal';
        
        if (charging) {
            batteryIcon = '⚡';
            batteryClass = 'battery-charging';
        } else if (percent < 20) {
            batteryClass = 'battery-low';
        } else if (percent < 50) {
            batteryClass = 'battery-medium';
        }
        
        batteryDiv.innerHTML = `
            <span class="${batteryClass}">
                ${batteryIcon} ${percent}% (${(voltage / 1000).toFixed(2)}V)
                ${charging ? ' Charging' : ''}
            </span>
        `;
    } catch (error) {
        console.error('Error loading battery status:', error);
    }
}

async function loadImages() {
    try {
        const response = await fetch(`${API_BASE}/api/images`);
        const data = await response.json();
        currentImages = data.images || [];
        displayImages();
    } catch (error) {
        console.error('Error loading images:', error);
        document.getElementById('imageList').innerHTML = '<p class="loading">Error loading images</p>';
    }
}

function displayImages() {
    const imageList = document.getElementById('imageList');
    
    if (currentImages.length === 0) {
        imageList.innerHTML = '<p class="loading">No images found. Upload some images to get started!</p>';
        return;
    }
    
    imageList.innerHTML = '';
    
    currentImages.forEach(image => {
        const item = document.createElement('div');
        item.className = 'image-item';
        
        const thumbnail = document.createElement('img');
        thumbnail.className = 'image-thumbnail';
        // Convert .bmp to .jpg for thumbnail
        const thumbnailName = image.name.replace(/\.bmp$/i, '.jpg');
        thumbnail.src = `${API_BASE}/api/image?name=${encodeURIComponent(thumbnailName)}`;
        thumbnail.alt = image.name;
        thumbnail.loading = 'lazy';
        
        const info = document.createElement('div');
        info.className = 'image-info';
        
        const name = document.createElement('div');
        name.className = 'image-name';
        name.textContent = image.name;
        
        const size = document.createElement('div');
        size.className = 'image-size';
        size.textContent = formatFileSize(image.size);
        
        info.appendChild(name);
        info.appendChild(size);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '×';
        deleteBtn.title = 'Delete image';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteImage(image.name);
        });
        
        item.appendChild(thumbnail);
        item.appendChild(info);
        item.appendChild(deleteBtn);
        
        item.addEventListener('click', () => selectImage(image.name, item));
        
        imageList.appendChild(item);
    });
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function deleteImage(filename) {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/delete`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ filename })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            console.log('Image deleted:', filename);
            loadImages(); // Reload the image list
        } else {
            alert('Failed to delete image');
        }
    } catch (error) {
        console.error('Error deleting image:', error);
        alert('Error deleting image');
    }
}

let isDisplaying = false;

async function selectImage(filename, element) {
    if (isDisplaying) {
        alert('Please wait for the current display operation to complete');
        return;
    }
    
    // Show confirmation dialog
    const confirmed = confirm(`Display "${filename}" on the e-paper screen?\n\nThis will take approximately 40 seconds to update.`);
    if (!confirmed) {
        return;
    }
    
    // Update selection
    document.querySelectorAll('.image-item').forEach(item => {
        item.classList.remove('selected');
    });
    element.classList.add('selected');
    selectedImage = filename;
    
    isDisplaying = true;
    
    // Show loading indicator
    const displayStatus = document.getElementById('displayStatus');
    displayStatus.style.display = 'block';
    
    try {
        const response = await fetch(`${API_BASE}/api/display`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ filename })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            console.log('Image displayed:', filename);
        } else if (data.status === 'busy') {
            alert('Display is currently updating, please wait');
        } else {
            alert('Failed to display image');
        }
    } catch (error) {
        console.error('Error displaying image:', error);
        alert('Error displaying image');
    } finally {
        // Hide loading indicator and re-enable display
        displayStatus.style.display = 'none';
        isDisplaying = false;
    }
}

document.getElementById('fileInput').addEventListener('change', (e) => {
    const fileName = e.target.files[0]?.name || '';
    document.getElementById('fileName').textContent = fileName ? `Selected: ${fileName}` : '';
    
    // Automatically submit the form when a file is selected
    if (e.target.files[0]) {
        document.getElementById('uploadForm').dispatchEvent(new Event('submit'));
    }
});

// Drag and drop support
const uploadArea = document.querySelector('.upload-area');

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        // Check if it's a JPEG file
        if (file.type === 'image/jpeg' || file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg')) {
            const fileInput = document.getElementById('fileInput');
            fileInput.files = files;
            document.getElementById('fileName').textContent = `Selected: ${file.name}`;
            
            // Automatically submit the form after drag and drop
            document.getElementById('uploadForm').dispatchEvent(new Event('submit'));
        } else {
            alert('Please drop a JPG/JPEG image file');
        }
    }
});

async function resizeImage(file, maxWidth, maxHeight, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const origWidth = img.width;
                const origHeight = img.height;
                
                // Determine if portrait or landscape
                const isPortrait = origHeight > origWidth;
                
                // Set canvas to exact display dimensions
                if (isPortrait) {
                    canvas.width = maxHeight;  // 480
                    canvas.height = maxWidth;  // 800
                } else {
                    canvas.width = maxWidth;   // 800
                    canvas.height = maxHeight; // 480
                }
                
                // Calculate scale to COVER (fill) the canvas
                const scaleX = canvas.width / origWidth;
                const scaleY = canvas.height / origHeight;
                const scale = Math.max(scaleX, scaleY);
                
                const scaledWidth = Math.round(origWidth * scale);
                const scaledHeight = Math.round(origHeight * scale);
                
                // Center and crop
                const offsetX = (canvas.width - scaledWidth) / 2;
                const offsetY = (canvas.height - scaledHeight) / 2;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);
                
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', quality);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const fileInput = document.getElementById('fileInput');
    const statusDiv = document.getElementById('uploadStatus');
    
    if (!fileInput.files[0]) {
        statusDiv.className = 'status-error';
        statusDiv.textContent = 'Please select a file';
        return;
    }
    
    statusDiv.textContent = 'Resizing and uploading...';
    statusDiv.className = '';
    
    try {
        // Create full-size image (800x480 or 480x800) for processing
        const fullSizeBlob = await resizeImage(fileInput.files[0], 800, 480, 0.90);
        
        // Create thumbnail (200x120 or 120x200) for gallery
        const thumbnailBlob = await resizeImage(fileInput.files[0], 200, 120, 0.85);
        
        const formData = new FormData();
        formData.append('image', fullSizeBlob, fileInput.files[0].name);
        formData.append('thumbnail', thumbnailBlob, 'thumb_' + fileInput.files[0].name);
        
        statusDiv.textContent = 'Uploading and converting...';
        
        const response = await fetch(`${API_BASE}/api/upload`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            statusDiv.className = 'status-success';
            statusDiv.textContent = `Successfully uploaded and converted: ${data.filename}`;
            fileInput.value = '';
            document.getElementById('fileName').textContent = '';
            
            // Refresh image gallery immediately
            loadImages();
        } else {
            statusDiv.className = 'status-error';
            statusDiv.textContent = 'Upload failed';
        }
    } catch (error) {
        console.error('Error uploading:', error);
        statusDiv.className = 'status-error';
        statusDiv.textContent = 'Error uploading file';
    }
});

async function loadConfig() {
    try {
        const response = await fetch(`${API_BASE}/api/config`);
        const data = await response.json();
        
        document.getElementById('autoRotate').checked = data.auto_rotate || false;
        document.getElementById('rotateInterval').value = data.rotate_interval || 3600;
        document.getElementById('brightnessFstop').value = (data.brightness_fstop !== undefined ? data.brightness_fstop : 0.3).toFixed(2);
        document.getElementById('contrast').value = (data.contrast !== undefined ? data.contrast : 1.2).toFixed(2);
    } catch (error) {
        console.error('Error loading config:', error);
    }
}

document.getElementById('configForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const statusDiv = document.getElementById('configStatus');
    const autoRotate = document.getElementById('autoRotate').checked;
    const rotateInterval = parseInt(document.getElementById('rotateInterval').value);
    const brightnessFstop = parseFloat(document.getElementById('brightnessFstop').value);
    const contrast = parseFloat(document.getElementById('contrast').value);
    
    try {
        const response = await fetch(`${API_BASE}/api/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                auto_rotate: autoRotate,
                rotate_interval: rotateInterval,
                brightness_fstop: brightnessFstop,
                contrast: contrast
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            statusDiv.className = 'status-success';
            statusDiv.textContent = 'Settings saved successfully';
        } else {
            statusDiv.className = 'status-error';
            statusDiv.textContent = 'Failed to save settings';
        }
    } catch (error) {
        console.error('Error saving config:', error);
        statusDiv.className = 'status-error';
        statusDiv.textContent = 'Error saving settings';
    }
});

// Initial load
loadImages();
loadConfig();
loadBatteryStatus();

// Periodic updates - only when page is visible/focused
let imageInterval = null;
let batteryInterval = null;

function startPeriodicUpdates() {
    // Only start if not already running
    if (!imageInterval) {
        imageInterval = setInterval(loadImages, 30000);
    }
    if (!batteryInterval) {
        batteryInterval = setInterval(loadBatteryStatus, 60000);
    }
}

function stopPeriodicUpdates() {
    if (imageInterval) {
        clearInterval(imageInterval);
        imageInterval = null;
    }
    if (batteryInterval) {
        clearInterval(batteryInterval);
        batteryInterval = null;
    }
}

// Listen for page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('Page hidden - stopping periodic updates');
        stopPeriodicUpdates();
    } else {
        console.log('Page visible - starting periodic updates');
        // Refresh data immediately when page becomes visible
        loadImages();
        loadBatteryStatus();
        startPeriodicUpdates();
    }
});

// Start periodic updates if page is currently visible
if (!document.hidden) {
    startPeriodicUpdates();
}
