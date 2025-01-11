/**
 * Putzig Framework for managing dynamic inputs and groups.
 */
class Putzig {

    /**
     * Initialize the Putzig framework.
     * @param {string} containerId - The ID of the container for inputs and groups.
     * @param {string} setupContainerId - The ID of the setup container for input creation.
     * @param {Function} [onSerializeCallback] - Optional callback for serialization updates.
     */
    constructor(containerId, setupContainerId, onSerializeCallback=null) {
        this.inputs = {}; // Holds input templates
        this.templates = {}; // Holds other templates
        this.container = document.querySelector(containerId); // Main container
        this.setupContainer = document.querySelector(setupContainerId); // Setup UI container
        this.usedNames = new Set(); // Tracks unique input names
        this.onSerializeCallback = onSerializeCallback;
        this.serializedData = null;
    }

    /**
     * Load templates from multiple files. Later templates override earlier ones.
     * @param {string[]} templateUrls - Array of URLs to template files.
     */
    async loadTemplates(templateUrls) {
        for (const url of templateUrls) {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Failed to fetch templates from ${url}`);
                const templateHtml = await response.text();
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = templateHtml;

                // Process all templates
                tempDiv.querySelectorAll('template').forEach(template => {
                    const templateId = template.id;
                    const content = template.innerHTML.trim();
                    const storage = template.dataset.hasOwnProperty('input') ? this.inputs : this.templates;

                    // Extract optional fields and validation logic
                    const validateFunc = template.dataset.validate ? new Function('input', `${template.dataset.validate};`) : null;
                    const optionalFields = template.dataset.optionalfields ? new Function(`return ${template.dataset.optionalfields};`)() : [];

                    // Store template metadata
                    storage[templateId] = {
                        html: content,
                        dataset: { ...template.dataset },
                        optionalFields,
                        validateFunc
                    };
                });
            } catch (error) {
                console.error(`Error loading templates: ${error.message}`);
            }
        }
    }

    /**
     * Render a template with placeholders replaced by context values.
     * @param {string} template - The template string.
     * @param {Object} context - The context object with placeholder values.
     * @returns {string} Rendered HTML string.
     */
    renderTemplate(template, context) {
        return template.replace(/{{(\w+)}}/g, (_, key) => context[key] || '');
    }

    /**
     * Generate a unique name for an input, avoiding duplicates.
     * @param {string} baseName - The base name to start from.
     * @returns {string} A unique name.
     */
    generateUniqueName(baseName = 'input') {
        let name = baseName;
        let counter = 1;
        while (this.usedNames.has(name)) {
            name = `${baseName} ${counter++}`;
        }
        return name;
    }

    /**
     * Generate a unique HTML-safe ID from a name.
     * @param {string} uniqueName - The base name to transform into an ID.
     * @returns {string} A unique ID.
     */
    generateUniqueId(uniqueName) {
        return uniqueName
            .toLowerCase()
            .replace(/[^a-z0-9-_\.]/g, '-')
            .replace(/^[^a-z]+/, 'id-');
    }

    deserialize(){

    }
    /**
     * Set up the input creation UI, dynamically updating fields when the input type changes.
     */
    setupInputs() {
        const setupTemplate = this.templates['setup-ui'];
        if (!setupTemplate) {
            console.error('Setup UI template not found.');
            return;
        }

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = setupTemplate.html;
        const setupHtml = tempDiv.firstElementChild;

        const inputTypeSelect = setupHtml.querySelector('.inputType');
        Object.keys(this.inputs).forEach(inputKey => {
            const option = document.createElement('option');
            option.value = inputKey;
            option.textContent = this.inputs[inputKey].dataset.displayname;
            inputTypeSelect.appendChild(option);
        });

        const nameInput = setupHtml.querySelector('.inputName');
        const dynamicInputContainer = setupHtml.querySelector('.dynamicInputContainer');
        const optionalInputContainer = setupHtml.querySelector('.optionalFieldsContainer');

        inputTypeSelect.addEventListener('change', () => {
            this.updateDynamicInput(dynamicInputContainer, optionalInputContainer, inputTypeSelect.value, nameInput);
        });

        const addInputButton = setupHtml.querySelector('.addInputButton');
        addInputButton.addEventListener('click', () => {
            this.addNewInput(dynamicInputContainer, optionalInputContainer, inputTypeSelect, nameInput);
        });

        this.setupContainer.appendChild(setupHtml);
        this.updateDynamicInput(dynamicInputContainer, optionalInputContainer, inputTypeSelect.value, nameInput);
    }

    /**
     * Update the dynamic input preview based on the selected type.
     */
    updateDynamicInput(container, optionalInputContainer, selectedType, nameInput) {
        const uniqueName = this.generateUniqueName(`${this.inputs[selectedType].dataset.displayname} ${nameInput.placeholder}`);
        nameInput.value = uniqueName;
        const input = this.renderInput(selectedType, uniqueName);
        container.innerHTML = '';
        container.appendChild(input);

        this.populateOptionalFields(optionalInputContainer, input, selectedType, nameInput);
    }

    /**
     * Populate optional fields for the selected input type.
     */
    populateOptionalFields(optionalInputContainer, input, selectedType, nameInput) {
        optionalInputContainer.innerHTML = '';
        const { optionalFields } = this.inputs[selectedType];

        optionalFields.forEach(optionalField => {
            const optionalFieldTemplate = this.templates[optionalField];
            if (!optionalFieldTemplate) {
                console.error(`Template ${optionalField} not found.`);
                return;
            }

            const optionalFieldInput = this.renderElement(optionalFieldTemplate, nameInput.value);
            const optionalFieldRealInput = optionalFieldInput.querySelector('.putzig-input');
            const realInput = input.querySelector('.putzig-input');

            this.setupOptionalFieldSync(optionalFieldRealInput, realInput, optionalField);
            optionalInputContainer.appendChild(optionalFieldInput);
        });
    }

    /**
     * Sync optional field input values with the real input.
     */
    setupOptionalFieldSync(optionalFieldRealInput, realInput, optionalField) {
        optionalFieldRealInput.addEventListener('input', () => {
            realInput[optionalField] = optionalFieldRealInput.value;
            realInput.dispatchEvent(new Event('input'));
        });
        realInput[optionalField] = optionalFieldRealInput.value;
    }

    /**
     * Add a new input to the container.
     */
    addNewInput(dynamicInputContainer, optionalInputContainer, inputTypeSelect, nameInput) {
        const previewInput = dynamicInputContainer.querySelector('input');
        const optionalFields = this.inputs[inputTypeSelect.value].optionalFields;
        const optionalFieldValues = optionalFields.reduce((acc, field) => {
            acc[field] = previewInput[field];
            return acc;
        }, {});

        this.createInput(this.container, inputTypeSelect.value, nameInput.value, previewInput.value, optionalFieldValues);
        this.updateDynamicInput(dynamicInputContainer, optionalInputContainer, inputTypeSelect.value, nameInput);
        this.serialize();
    }

    /**
     * Create and add a new input element to the container.
     */
    createInput(container, selectedType, name, value, optionalFields) {
        const template = this.templates['input-row'];
        if (!template) {
            console.error('Template input-row not found.');
            return;
        }

        const newInput = this.renderInput(selectedType, name, value, optionalFields);
        const creationContext = {
            id: this.generateUniqueId(name),
            value,
            type: selectedType,
            label: name,
            input: `<div id="input-replacement-${this.generateUniqueId(name)}"></div>`
        };

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = this.renderTemplate(template.html, creationContext);

        const inputWrapper = tempDiv.firstElementChild;
        inputWrapper.querySelector(`#input-replacement-${this.generateUniqueId(name)}`).replaceWith(newInput);
        container.appendChild(inputWrapper);

        if(optionalFields){
            for (const [key, value] of Object.entries(optionalFields)) {
              inputWrapper.setAttribute(`data-optionalfield${key}`, value);
            }
        }

        inputWrapper.querySelectorAll('.delete-button').forEach(deleteButton => {
            deleteButton.addEventListener('click', () => {
                this.usedNames.delete(name);
                inputWrapper.remove();
                this.serialize();
            });
        });

        this.usedNames.add(name);
    }

    /**
     * Render an input element using the specified type and context.
     */
    renderInput(type, uniqueName, value = null, optionalFields = null) {
        const template = this.inputs[type];
        return this.renderElement(template, uniqueName, value, optionalFields);
    }

    /**
     * Render a generic element from a template.
     */
    renderElement(template, uniqueName, value = null, optionalFields = null) {
        if (!template) {
            console.error(`Template not found.`);
            return;
        }

        const id = this.generateUniqueId(uniqueName) ;
        const creationContext = {
            id: id,
            label: uniqueName,
            name: id,
            value: value ?? template.dataset.default
        };

        const input = document.createElement('div');
        input.innerHTML = this.renderTemplate(template.html, creationContext);

        const syncables = input.querySelectorAll('[data-sync]');
        const realInput = input.querySelector('.putzig-input');

        this.applyOptionalFieldValues(realInput, optionalFields, template);
        this.setupRealInputSync(realInput, syncables, template);

        realInput.value = value ?? template.dataset.default;

        return input;
    }

    /**
     * Apply optional field values to the real input.
     */
    applyOptionalFieldValues(realInput, optionalFields, template) {
        if (optionalFields) {
            template.optionalFields.forEach(optionalField => {
                if (optionalFields[optionalField]) {
                    realInput[optionalField] = optionalFields[optionalField];
                }
            });
        }
    }

    /**
     * Sync real input with associated elements.
     */
    setupRealInputSync(realInput, syncables, template) {
        realInput.addEventListener('input', () => {
            if (template.validateFunc) {
                template.validateFunc(realInput);
            }
            syncables.forEach(syncable => {
                syncable[syncable.dataset.sync] = realInput.value;
            });

            this.serialize();
        });
    }


    /**
     * Serialize the current state of inputs.
     */
    serialize() {
        this.serializedData = [];
        this.usedNames=new Set();
        
        // Iterate over all input wrappers in the container
        this.container.querySelectorAll('.putzig-input-wrapper').forEach(inputWrapper => {
            const input = inputWrapper.querySelector('.putzig-input');
            
            this.serializedData.push({
                uniqueName: inputWrapper.dataset.uniquename, // Use the unique name as the identifier
                type: inputWrapper.dataset.type,
                value: input.value,
                optionalFields: this.serializeOptionalFields(inputWrapper)
            });

        });

        this.serializedData = JSON.stringify(this.serializedData, null, 2);

        if(this.onSerializeCallback != null){
            this.onSerializeCallback(this.serializedData);
        }
    }

    /**
     * Serialize optional fields for a given input wrapper.
     * @param {HTMLElement} inputWrapper - The wrapper element containing the input.
     * @returns {Object} Key-value pairs of optional fields and their values.
     */
    serializeOptionalFields(inputWrapper) {
        const optionalFields = {};

        const fieldTypes = this.inputs[inputWrapper.dataset.type].optionalFields;
        fieldTypes.forEach(fieldType => {
            const optionalFieldKey = `optionalfield${fieldType}`;
            if(inputWrapper.dataset.hasOwnProperty(optionalFieldKey)){
               optionalFields[fieldType] = inputWrapper.dataset[optionalFieldKey];
            }
        });

        return optionalFields;
    }

    /**
     * Deserialize a JSON string to reconstruct inputs in the container.
     */
    deserialize(serializedData) {
        try {
            const data = JSON.parse(serializedData);

            // Clear existing content
            this.container.innerHTML = '';

            console.log(data);
            data.forEach(inputData => {
                const { uniqueName, type, value, optionalFields } = inputData;
                this.usedNames.add(uniqueName);
                // Render the input
                this.createInput(this.container, type, uniqueName, value, optionalFields);
            });
        } catch (error) {
            console.error('Failed to deserialize data:', error);
        }
    }
}

export default Putzig;
