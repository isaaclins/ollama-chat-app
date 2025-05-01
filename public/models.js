class ModelManager {
  constructor() {
    this.currentModel = 'llava-llama3';
    this.models = new Map();
    this.activeDownloads = new Map(); // Track active downloads
    this.setupUI();
    this.loadModels();

    // Setup dropdown functionality
    const dropdown = document.querySelector('.dropdown');
    const dropdownBtn = document.getElementById('modelDropdownBtn');
    
    dropdownBtn.onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('active');
    };

    document.addEventListener('click', () => {
      dropdown.classList.remove('active');
    });

    // Add Model button opens the model manager
    document.getElementById('addModelBtn').onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.remove('active');
      document.getElementById('modelManager').style.display = 'block';
    };
  }

  setupUI() {
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

    // Event listeners for modal
    modal.querySelector('.close-btn').onclick = () => modal.style.display = 'none';
    modal.onclick = (e) => {
      if (e.target === modal) modal.style.display = 'none';
    };

    const addModelInput = document.getElementById('newModelInput');
    modal.querySelector('#addModelBtn').onclick = () => {
      const modelName = addModelInput.value.trim();
      if (modelName) {
        this.pullModel(modelName);
      }
    };
    
    addModelInput.onkeypress = (e) => {
      if (e.key === 'Enter') modal.querySelector('#addModelBtn').click();
    };
  }

  updateModelList() {
    const modelList = document.getElementById('modelList');
    modelList.innerHTML = '';

    this.models.forEach((modelInfo, modelName) => {
      const option = document.createElement('div');
      option.className = `model-option ${modelName === this.currentModel ? 'active' : ''}`;
      option.textContent = modelName;
      option.onclick = () => this.useModel(modelName);
      modelList.appendChild(option);
    });
  }

  async loadModels() {
    try {
      const response = await fetch('/api/models');
      const data = await response.json();
      
      this.models.clear();
      for (const model of data.models) {
        await this.addModelToList(model.name);
      }
      
      this.updateModelList();
    } catch (error) {
      console.error('Error loading models:', error);
    }
  }

  async addModelToList(modelName) {
    try {
      const response = await fetch(`/api/models/${modelName}`);
      const modelInfo = await response.json();
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
        <div class="progress-bar-container">
          <div class="progress-bar"></div>
        </div>
        <div class="progress-stats">
          <span class="progress-text"></span>
          <span class="progress-percentage">0%</span>
        </div>
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
    
    return {
      textElement: modelProgress.querySelector('.progress-text'),
      barElement: modelProgress.querySelector('.progress-bar'),
      percentageElement: modelProgress.querySelector('.progress-percentage'),
      container: modelProgress
    };
  }

  updateProgress(progressElements, text) {
    // Try to extract progress information from the text
    const progressMatch = text.match(/(\d+(\.\d+)?)\s*MB\s*\/\s*(\d+(\.\d+)?)\s*GB/);
    const progressPercentMatch = text.match(/(\d+)%/);
    
    if (progressMatch) {
      const [, downloaded, , total] = progressMatch;
      const percentage = (parseFloat(downloaded) / (parseFloat(total) * 1024)) * 100;
      progressElements.barElement.style.width = `${percentage}%`;
      progressElements.percentageElement.textContent = `${Math.round(percentage)}%`;
    } else if (progressPercentMatch) {
      const percentage = parseInt(progressPercentMatch[1]);
      progressElements.barElement.style.width = `${percentage}%`;
      progressElements.percentageElement.textContent = `${percentage}%`;
    }

    // Clean up and format the progress text
    let cleanText = text
      .replace(/\[\?2026h\[\?25l\[A\[1G/, '') // Remove control characters
      .replace(/\[\d+G/, '')
      .trim();
    
    if (cleanText.includes('pulling manifest')) {
      cleanText = 'Pulling manifest...';
      progressElements.barElement.classList.add('indeterminate');
    } else if (cleanText.includes('verifying')) {
      cleanText = 'Verifying download...';
      progressElements.barElement.classList.add('indeterminate');
    } else {
      progressElements.barElement.classList.remove('indeterminate');
    }

    progressElements.textElement.textContent = cleanText;
  }

  async pullModel(modelName) {
    if (!modelName || this.activeDownloads.has(modelName)) return;

    const progressElements = this.getProgressElement(modelName);
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
            this.updateProgress(progressElements, event.data);
            
            if (event.type === 'complete') {
              await this.loadModels();
              progressElements.container.remove();
              this.activeDownloads.delete(modelName);
            }
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        progressElements.textElement.textContent = 'Download cancelled';
      } else {
        console.error('Error pulling model:', error);
        progressElements.textElement.textContent = `Error: ${error.message}`;
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
    window.currentModel = modelName;
    document.getElementById('currentModelDisplay').textContent = modelName;
    this.updateModelList();
    document.querySelector('.dropdown').classList.remove('active');
  }
}

// Initialize the model manager
const modelManager = new ModelManager(); 
