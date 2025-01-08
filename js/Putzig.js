class Putzig {

    constructor(containerId, setupContainerId, onSerializeCallback = null) {
        this.container = document.querySelector(containerId);
        this.setupContainer = document.querySelector(setupContainerId);
        this.templates = {};
        this.inputs = {};
        this.onSerializeCallback = onSerializeCallback; // Callback to trigger on serialization
        this.serializedData = this.serialize();
    }

    // Load templates from multiple files
    async loadTemplates(templateUrls) {
        for (const url of templateUrls) {
            const response = await fetch(url);
            const templateHtml = await response.text();
            const templateContainer = document.createElement('div');
            templateContainer.innerHTML = templateHtml;

            // Process each <template> element
            templateContainer.querySelectorAll('template').forEach(template => {
                const id = template.id;
                const content = template.innerHTML.trim();
                this.templates[id] = content;

                // Auto-register input types
                const inputType = template.dataset.inputType;
                if (inputType) {
                    this.registerInputType(inputType, id);
                }
            });
        }
    }

    // Register a new input type
    registerInputType(type, templateId, initFunction) {
        if (!this.templates[templateId]) {
            console.error(`Template "${templateId}" not found.`);
            return;
        }
        this.inputs[type] = { template: this.templates[templateId], initFunction };
    }

    // Render an input
    renderInput(type, config) {
        if (!this.inputs[type]) {
            console.error(`Input type "${type}" is not registered.`);
            return;
        }

        const { template, initFunction } = this.inputs[type];
        const renderedHtml = this.renderTemplate(template, config);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = renderedHtml;
        const htmlElement = tempDiv.firstElementChild;

        htmlElement.dataset.type = type; // Store input type for serialization
        htmlElement.dataset.label = config.label; // Store label metadata
        if (config.step) htmlElement.dataset.step = config.step; // Store step metadata

        this.container.appendChild(htmlElement);

        const inputElement = htmlElement.querySelector('[data-ui-input]');
        if (config.defaultValue !== undefined) {
            inputElement.value = config.defaultValue;
        }

        // Add change listener for auto-serialization
        inputElement.addEventListener('change', () => this.serializeAndCallback());

        if (initFunction) {
            initFunction(htmlElement, config);
        }
    }

    // Trigger serialization and invoke callback
    serializeAndCallback() {
        this.serialize();
        if (this.onSerializeCallback) {
            this.onSerializeCallback(this.serializedData);
        }
    }

    // Render a template with placeholders
    renderTemplate(template, context) {
        return template.replace(/{{(\w+)}}/g, (_, key) => context[key] || '');
    }

    // Get all values
    getValues() {
        const values = {};
        this.container.querySelectorAll('[data-ui-input]').forEach(input => {
            const name = input.dataset.uiName;
            const value = input.value;
            values[name] = value;
        });
        return values;
    }

    getSerializedData() {
        return this.serializedData;
    }

    // Serialize inputs into JSON
    serialize() {
        const inputs = [];
        this.container.querySelectorAll('[data-ui-input]').forEach(input => {
            const parent = input.closest('.input-wrapper');
            const type = parent.dataset.type;
            const name = input.dataset.uiName;
            const value = input.value;

            const metadata = {
                type,
                name,
                value,
            };

            // Include additional attributes like step, label, etc.
            Object.keys(parent.dataset).forEach(key => {
                if (key !== 'type') metadata[key] = parent.dataset[key];
            });

            inputs.push(metadata);
        });
        
        this.serializedData = JSON.stringify(inputs);
        return this.serializedData;
    }

    // Deserialize JSON into inputs
    deserialize(json) {
        if(!!json && json.length > 0){
            const inputs = JSON.parse(json);

            // Clear existing inputs
            this.container.innerHTML = '';

            // Reconstruct inputs
            inputs.forEach(config => {
                const { type } = config;
                this.renderInput(type, config);
                
                // Find the rendered input and explicitly set its value
                const inputElement = this.container.querySelector(`[data-ui-name="${config.name}"]`);
                if (inputElement) {
                    inputElement.value = config.value;

                    // Reattach the change listener for auto-serialization
                    inputElement.addEventListener('change', () => this.serializeAndCallback());
                }
            });

            this.serialize();
        }
    }

    // Setup inputs via UI
    setupInputs() {
        const setupTemplate = this.templates['setup-ui'];
        const renderedHtml = this.renderTemplate(setupTemplate, {});
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = renderedHtml;
        const setupHtml = tempDiv.firstElementChild;

        this.setupContainer.appendChild(setupHtml);

        // Populate input types dynamically
        const inputTypeSelect = setupHtml.querySelector('#inputType');
        Object.keys(this.inputs).forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            inputTypeSelect.appendChild(option);
        });

        setupHtml.querySelector('#addInputButton').addEventListener('click', () => {
            const type = setupHtml.querySelector('#inputType').value;
            const label = setupHtml.querySelector('#inputLabel').value;
            const name = setupHtml.querySelector('#inputName').value;
            const defaultValue = setupHtml.querySelector('#inputDefaultValue').value;
            const step = setupHtml.querySelector('#inputStep')?.value || undefined;

            this.renderInput(type, { label, name, defaultValue, step });
            this.serializeAndCallback(); // Trigger serialization after adding a new input

        });
    }
}
