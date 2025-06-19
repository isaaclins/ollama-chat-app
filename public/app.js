const messagesDiv = document.getElementById('messages');
const promptInput = document.getElementById('promptInput');
const sendBtn = document.getElementById('sendBtn');
const imageInput = document.getElementById('imageInput');

let currentController = null; // For cancelling requests

// === Chat Session Management ===

const chatList = document.getElementById('chatList');
const newChatBtn = document.getElementById('newChatBtn');

let chatSessions = JSON.parse(sessionStorage.getItem('chatSessions') || '[]');
let activeChatId = sessionStorage.getItem('activeChatId') || null;

function saveSessions() {
  sessionStorage.setItem('chatSessions', JSON.stringify(chatSessions));
  sessionStorage.setItem('activeChatId', activeChatId);
}

function getCurrentSession() {
  return chatSessions.find(s => s.id === activeChatId);
}

function renderChatList() {
  if (!chatList) return;
  chatList.innerHTML = '';
  chatSessions.forEach(session => {
    const li = document.createElement('li');
    li.textContent = session.name;
    if (session.id === activeChatId) li.classList.add('active');

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.textContent = '×';
    delBtn.className = 'delete-chat';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Delete \"${session.name}\"?`)) {
        chatSessions = chatSessions.filter(s => s.id !== session.id);
        if (activeChatId === session.id) {
          activeChatId = chatSessions[0]?.id || null;
        }
        saveSessions();
        renderChatList();
        renderChatSession();
      }
    };

    li.appendChild(delBtn);
    li.onclick = () => {
      activeChatId = session.id;
      saveSessions();
      renderChatList();
      renderChatSession();
    };
    chatList.appendChild(li);
  });
}

function renderChatSession() {
  if (!messagesDiv) return;
  messagesDiv.innerHTML = '';
  const session = getCurrentSession();
  if (!session) return;
  session.messages.forEach(m => {
    addMessage(m.content, m.role === 'user' ? 'user' : 'bot', m.imageData);
  });
}

function createNewChat() {
  const id = Date.now().toString();
  const name = `Chat ${chatSessions.length + 1}`;
  chatSessions.push({ id, name, messages: [] });
  activeChatId = id;
  saveSessions();
  renderChatList();
  renderChatSession();
}

// Initialise sessions
if (!chatSessions.length) {
  createNewChat();
} else {
  if (!activeChatId || !chatSessions.find(s => s.id === activeChatId)) {
    activeChatId = chatSessions[0].id;
  }
  renderChatList();
  renderChatSession();
}

if (newChatBtn) newChatBtn.addEventListener('click', createNewChat);

// Move model selector into sidebar if present
const sidebar = document.getElementById('sidebar');
const modelSelector = document.getElementById('model-selector');
if (sidebar && modelSelector) {
  sidebar.insertBefore(modelSelector, sidebar.firstChild);
  modelSelector.classList.add('sidebar-section');
}

// === Reasoning visibility toggle ===

const reasonToggle = document.getElementById('reasonToggle');
const BODY = document.body;

function applyReasoningPref() {
  const show = sessionStorage.getItem('showReasoning') === 'true';
  if (reasonToggle) reasonToggle.checked = show;
  BODY.classList.toggle('hide-think', !show);
}

applyReasoningPref();

if (reasonToggle) {
  reasonToggle.addEventListener('change', () => {
    const show = reasonToggle.checked;
    sessionStorage.setItem('showReasoning', show);
    BODY.classList.toggle('hide-think', !show);
  });
}

function addMessage(content, className, imageData = null) {
  const div = document.createElement('div');
  div.classList.add('message', className);

  if (imageData) {
    const img = document.createElement('img');
    img.src = imageData;
    img.classList.add('message-image');
    div.appendChild(img);
  }

  if (content !== undefined && content !== null) {
    const span = document.createElement('span');
    span.classList.add('text');
    if (className === 'bot') {
      span.innerHTML = formatMessage(content);
    } else {
      span.textContent = content;
    }
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
    
    // Persist user message in current session
    const currentSession = getCurrentSession();
    if (currentSession) {
      currentSession.messages.push({ role: 'user', content: prompt, imageData });
      saveSessions();
    }
    
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
    
    let responseText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const text = decoder.decode(value, { stream: true });
      if (text) {
        responseText += text;
        botTextSpan.textContent = responseText;
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }
    }

    // After streaming completes, persist bot response
    if (currentSession) {
      currentSession.messages.push({ role: 'bot', content: responseText });
      saveSessions();
    }

    // Replace plain text with formatted HTML
    botTextSpan.innerHTML = formatMessage(responseText);
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

// === Markdown & "think" formatter ===

function formatMessage(text) {
  if (!text) return '';
  // Escape HTML special chars first
  text = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Restore <think> blocks and wrap with span.think (case-insensitive)
  text = text.replace(/&lt;think&gt;([\s\S]*?)&lt;\/think&gt;/gi, (_m, p1) => `<span class="think">${p1.trim()}</span>`);

  // Bold **text**
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic *text*  (single asterisks that are not bold)
  text = text.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');

  // Newlines → <br>
  text = text.replace(/\n/g, '<br>');

  return text;
}
