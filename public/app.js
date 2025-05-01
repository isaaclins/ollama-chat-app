const messagesDiv = document.getElementById('messages');
const promptInput = document.getElementById('promptInput');
const sendBtn = document.getElementById('sendBtn');
const imageInput = document.getElementById('imageInput');

let currentController = null; // For cancelling requests

function addMessage(content, className, imageData = null) {
  const div = document.createElement('div');
  div.classList.add('message', className);

  if (imageData) {
    const img = document.createElement('img');
    img.src = imageData;
    img.classList.add('message-image');
    div.appendChild(img);
  }

  if (content) {
    const span = document.createElement('span');
    span.classList.add('text');
    span.textContent = content;
    div.appendChild(span);
  }

  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  return div.querySelector('.text') || div;
}

let pastedImage = null;
let pastedImagePreview = null;

function setLoading(isLoading, canCancel = false) {
  sendBtn.disabled = false; // Always enable the button
  if (isLoading) {
    sendBtn.innerHTML = canCancel ? 'Cancel' : 'Sending<span class="loading"></span>';
    sendBtn.classList.add('cancel');
  } else {
    sendBtn.textContent = 'Send';
    sendBtn.classList.remove('cancel');
    currentController = null;
  }
}

function showImagePreview(imageData) {
  // Remove existing preview if any
  if (pastedImagePreview) {
    pastedImagePreview.remove();
  }

  // Create preview container
  pastedImagePreview = document.createElement('div');
  pastedImagePreview.className = 'image-preview';
  
  // Create image
  const img = document.createElement('img');
  img.src = imageData;
  
  // Create remove button
  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-image';
  removeBtn.innerHTML = '×';
  removeBtn.onclick = clearImage;
  
  pastedImagePreview.appendChild(img);
  pastedImagePreview.appendChild(removeBtn);
  promptInput.parentElement.insertBefore(pastedImagePreview, promptInput);
  
  // Update placeholder
  promptInput.placeholder = 'Ask about the image...';
}

function clearImage() {
  pastedImage = null;
  if (pastedImagePreview) {
    pastedImagePreview.remove();
    pastedImagePreview = null;
  }
  imageInput.value = '';
  promptInput.placeholder = 'Type your message...';
}

async function getBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      // Remove the data URL prefix and get just the base64 string
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = error => reject(error);
  });
}

async function sendMessage() {
  const prompt = promptInput.value.trim();
  const hasImage = pastedImage || imageInput.files.length > 0;
  if (!prompt && !hasImage) return;

  // If the button is in cancel state, cancel the request
  if (currentController) {
    currentController.abort();
    setLoading(false);
    return;
  }

  setLoading(true);
  currentController = new AbortController();
  
  try {
    let imageData = null;
    let base64Image = null;
    
    if (pastedImage) {
      imageData = pastedImage;
      base64Image = pastedImage.split(',')[1];
    } else if (imageInput.files.length) {
      const file = imageInput.files[0];
      imageData = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
      base64Image = await getBase64(file);
    }

    // Add user message with image if present
    addMessage(prompt, 'user', imageData);
    
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        model: window.currentModel || 'llava-llama3',
        messages: [{
          role: 'user',
          content: prompt || 'What is in this image?',
          images: base64Image ? [base64Image] : undefined
        }]
      }),
      signal: currentController.signal
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    
    // Create a message container for the bot's response
    const botTextSpan = addMessage('', 'bot');
    
    // Set up text decoder for the stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    
    setLoading(true, true); // Show cancel button while receiving response
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const text = decoder.decode(value, { stream: true });
      if (text) {
        botTextSpan.textContent += text;
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      addMessage('Request cancelled', 'bot');
    } else {
      console.error('Error:', error);
      addMessage('Sorry, there was an error processing your request. Please try again.', 'bot');
    }
  } finally {
    setLoading(false);
    promptInput.value = '';
    clearImage();
  }
}

// Handle file selection
imageInput.addEventListener('change', async () => {
  if (imageInput.files.length) {
    const file = imageInput.files[0];
    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      alert('Image size too large. Please select an image under 50MB.');
      imageInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      pastedImage = e.target.result;
      showImagePreview(pastedImage);
    };
    reader.readAsDataURL(file);
  }
});

// Handle paste event
document.addEventListener('paste', async (e) => {
  const items = e.clipboardData.items;
  for (let item of items) {
    if (item.type.startsWith('image')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        alert('Image size too large. Please select an image under 50MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = e => {
        pastedImage = e.target.result;
        showImagePreview(pastedImage);
      };
      reader.readAsDataURL(file);
      break;
    }
  }
});

sendBtn.addEventListener('click', sendMessage);
promptInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
