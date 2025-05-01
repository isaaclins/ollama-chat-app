class ModelManager {
  constructor() {
    this.currentModel = 'llava-llama3';
    this.models = new Map();
    this.activeDownloads = new Map(); // Track active downloads
    this.setupUI();
    this.loadModels();
  }

  setupUI() {
    // Create model manager button
    const modelBtn = document.createElement('button');
    modelBtn.id = 'modelManagerBtn';
    modelBtn.innerHTML = '⚙️ Models';
    document.querySelector('#input-area').prepend(modelBtn);

    // Create model manager modal
    const modal = document.createElement('div');
    modal.id = 'modelManager';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>Model Manager</h2>
          <button class="close-btn">&times;</button>
        </div>
        <div class="model-list"></div>
        <div class="add-model">
          <input type="text" id="newModelInput" placeholder="Enter model name (e.g., llama2)">
          <button id="addModelBtn">Add Model</button>
        </div>
        <div id="pullProgress"></div>
      </div>
    `;
    document.body.appendChild(modal);

    // Event listeners
    modelBtn.onclick = () => modal.style.display = 'block';
    modal.querySelector('.close-btn').onclick = () => modal.style.display = 'none';
    modal.onclick = (e) => {
      if (e.target === modal) modal.style.display = 'none';
    };

    const addModelBtn = document.getElementById('addModelBtn');
    const newModelInput = document.getElementById('newModelInput');
    
    addModelBtn.onclick = () => {
      const modelName = newModelInput.value.trim();
      if (modelName) {
        this.pullModel(modelName);
        newModelInput.value = '';
      }
    };
    
    newModelInput.onkeypress = (e) => {
      if (e.key === 'Enter') addModelBtn.click();
    };
  }

  async loadModels() {
    try {
      const response = await fetch('/api/models');
      const data = await response.json();
      const modelList = document.querySelector('.model-list');
      modelList.innerHTML = '';

      for (const model of data.models) {
        await this.addModelToList(model.name);
      }
    } catch (error) {
      console.error('Error loading models:', error);
    }
  }

  async addModelToList(modelName) {
    try {
      const response = await fetch(`/api/models/${modelName}`);
      const modelInfo = await response.json();
      
      const modelDiv = document.createElement('div');
      modelDiv.className = 'model-item';
      
      const size = modelInfo.size ? (modelInfo.size / (1024 * 1024 * 1024)).toFixed(1) + 'GB' : 'N/A';
      const contextWindow = modelInfo.details?.parameter_size || 'N/A';
      
      modelDiv.innerHTML = `
        <div class="model-info">
          <span class="model-name">${modelName}</span>
          <span class="model-details">
            Size: ${size} | Parameters: ${contextWindow}
          </span>
        </div>
        <div class="model-actions">
          <button class="use-model-btn ${this.currentModel === modelName ? 'active' : ''}" 
                  data-model="${modelName}">Use</button>
          <button class="delete-model-btn" data-model="${modelName}">Delete</button>
        </div>
      `;

      modelDiv.querySelector('.use-model-btn').onclick = () => this.useModel(modelName);
      modelDiv.querySelector('.delete-model-btn').onclick = () => this.deleteModel(modelName);

      document.querySelector('.model-list').appendChild(modelDiv);
      this.models.set(modelName, modelInfo);
    } catch (error) {
      console.error(`Error adding model ${modelName} to list:`, error);
    }
  }

  // Create or get progress element for a model
  getProgressElement(modelName) {
    const progressDiv = document.getElementById('pullProgress');
    let modelProgress = progressDiv.querySelector(`[data-model="${modelName}"]`);
    
    if (!modelProgress) {
      modelProgress = document.createElement('div');
      modelProgress.className = 'model-progress';
      modelProgress.setAttribute('data-model', modelName);
      modelProgress.innerHTML = `
        <div class="progress-header">
          <span class="model-name">${modelName}</span>
          <button class="cancel-download" data-model="${modelName}">×</button>
        </div>
        <div class="progress-text"></div>
      `;
      progressDiv.appendChild(modelProgress);

      // Add cancel handler
      modelProgress.querySelector('.cancel-download').onclick = () => {
        const controller = this.activeDownloads.get(modelName);
        if (controller) {
          controller.abort();
          this.activeDownloads.delete(modelName);
          modelProgress.remove();
        }
      };
    }
    
    return modelProgress.querySelector('.progress-text');
  }

  async pullModel(modelName) {
    if (!modelName || this.activeDownloads.has(modelName)) return;

    const progressElement = this.getProgressElement(modelName);
    const controller = new AbortController();
    this.activeDownloads.set(modelName, controller);
    
    try {
      const response = await fetch('/api/models/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName }),
        signal: controller.signal
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const event = JSON.parse(line.slice(6));
            progressElement.textContent = event.data;
            
            if (event.type === 'complete') {
              await this.loadModels();
              progressElement.parentElement.remove();
              this.activeDownloads.delete(modelName);
            }
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        progressElement.textContent = 'Download cancelled';
      } else {
        console.error('Error pulling model:', error);
        progressElement.textContent = `Error: ${error.message}`;
      }
      this.activeDownloads.delete(modelName);
    }
  }

  async deleteModel(modelName) {
    if (!confirm(`Are you sure you want to delete ${modelName}?`)) return;
    
    try {
      await fetch(`/api/models/${modelName}`, { method: 'DELETE' });
      await this.loadModels();
    } catch (error) {
      console.error('Error deleting model:', error);
    }
  }

  useModel(modelName) {
    this.currentModel = modelName;
    document.querySelectorAll('.use-model-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.model === modelName);
    });
    // Update the model name in the chat interface
    window.currentModel = modelName;
  }
}

// Initialize the model manager
const modelManager = new ModelManager(); 
