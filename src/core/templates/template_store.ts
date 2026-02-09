/**
 * Template Store - Manages reusable templates for skills
 * Week 2 Feature: Enhanced template management beyond simple allowlists
 */

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: 'email' | 'call' | 'payment' | 'http' | 'custom';
  skillName: string;
  template: Record<string, unknown>;
  variables: string[];
  createdAt: string;
  updatedAt: string;
  owner: string;
  enabled: boolean;
}

export interface TemplateStoreOptions {
  storePath: string;
}

/**
 * TemplateStore manages template definitions for reusable skill configurations
 * Templates are stored as JSON and loaded at runtime
 */
export class TemplateStore {
  private templates: Map<string, TemplateDefinition> = new Map();
  private readonly storePath: string;

  constructor(options: TemplateStoreOptions) {
    this.storePath = options.storePath;
  }

  /**
   * Add a new template to the store
   * @param template Template definition
   * @returns Template ID
   */
  addTemplate(template: Omit<TemplateDefinition, 'createdAt' | 'updatedAt'>): string {
    const now = new Date().toISOString();
    const fullTemplate: TemplateDefinition = {
      ...template,
      createdAt: now,
      updatedAt: now
    };
    
    this.templates.set(template.id, fullTemplate);
    return template.id;
  }

  /**
   * Get a template by ID
   * @param id Template ID
   * @returns Template definition or undefined
   */
  getTemplate(id: string): TemplateDefinition | undefined {
    return this.templates.get(id);
  }

  /**
   * List all templates, optionally filtered by category or skill
   * @param filter Optional filter criteria
   * @returns Array of template definitions
   */
  listTemplates(filter?: {
    category?: TemplateDefinition['category'];
    skillName?: string;
    enabled?: boolean;
  }): TemplateDefinition[] {
    let templates = Array.from(this.templates.values());
    
    if (filter?.category) {
      templates = templates.filter(t => t.category === filter.category);
    }
    
    if (filter?.skillName) {
      templates = templates.filter(t => t.skillName === filter.skillName);
    }
    
    if (filter?.enabled !== undefined) {
      templates = templates.filter(t => t.enabled === filter.enabled);
    }
    
    return templates;
  }

  /**
   * Update an existing template
   * @param id Template ID
   * @param updates Partial template updates
   * @returns Updated template or undefined if not found
   */
  updateTemplate(
    id: string,
    updates: Partial<Omit<TemplateDefinition, 'id' | 'createdAt' | 'updatedAt'>>
  ): TemplateDefinition | undefined {
    const existing = this.templates.get(id);
    if (!existing) {
      return undefined;
    }
    
    const updated: TemplateDefinition = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    this.templates.set(id, updated);
    return updated;
  }

  /**
   * Delete a template
   * @param id Template ID
   * @returns True if deleted, false if not found
   */
  deleteTemplate(id: string): boolean {
    return this.templates.delete(id);
  }

  /**
   * Apply a template to generate skill input
   * @param templateId Template ID
   * @param variables Variable values to substitute
   * @returns Skill input object
   */
  applyTemplate(
    templateId: string,
    variables: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    const template = this.templates.get(templateId);
    if (!template || !template.enabled) {
      return undefined;
    }
    
    // Simple variable substitution
    const input = JSON.parse(JSON.stringify(template.template));
    return this.substituteVariables(input, variables);
  }

  /**
   * Recursively substitute variables in template
   */
  private substituteVariables(
    obj: any,
    variables: Record<string, unknown>
  ): any {
    if (typeof obj === 'string') {
      // Replace {{variableName}} patterns
      return obj.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
        return variables[varName] !== undefined 
          ? String(variables[varName]) 
          : match;
      });
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.substituteVariables(item, variables));
    }
    
    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.substituteVariables(value, variables);
      }
      return result;
    }
    
    return obj;
  }

  /**
   * Export all templates to JSON
   * @returns JSON string of all templates
   */
  exportTemplates(): string {
    return JSON.stringify(
      Array.from(this.templates.values()),
      null,
      2
    );
  }

  /**
   * Import templates from JSON
   * @param json JSON string of templates
   * @returns Number of templates imported
   */
  importTemplates(json: string): number {
    try {
      const templates = JSON.parse(json) as TemplateDefinition[];
      let count = 0;
      
      for (const template of templates) {
        this.templates.set(template.id, template);
        count++;
      }
      
      return count;
    } catch (error) {
      throw new Error(`Failed to import templates: ${error}`);
    }
  }
}
