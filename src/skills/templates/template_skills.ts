/**
 * Template Management Skills
 * Week 2 Feature: Skills for managing templates
 */

import type { SkillDefinition } from '../../types/skill';
import type { SkillExecutionContext } from '../../types/skill';
import { TemplateStore } from '../../core/templates/template_store';
import * as path from 'node:path';

const templateStore = new TemplateStore({
  storePath: path.join(process.cwd(), 'data', 'templates')
});

/**
 * List all templates skill
 */
export const list_templates: SkillDefinition<
  { category?: string; skillName?: string; enabled?: boolean },
  { templates: any[]; count: number }
> = {
  name: 'list_templates',
  description: 'List all available templates',
  category: 'local',
  allowWhenNetworkOff: true,
  riskLevel: 'LOW',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    properties: {
      category: { type: 'string' },
      skillName: { type: 'string' },
      enabled: { type: 'boolean' }
    }
  },
  auditTemplate: {
    action: 'list_templates',
    target: (input) => input.category || 'all'
  },
  handler: async (input, context: SkillExecutionContext) => {
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: 'list_templates',
      approved: false,
      target: 'templates',
      result: 'success'
    });

    const templates = templateStore.listTemplates({
      category: input.category as any,
      skillName: input.skillName,
      enabled: input.enabled
    });

    return {
      templates,
      count: templates.length
    };
  }
};

/**
 * Get a specific template skill
 */
export const get_template: SkillDefinition<
  { id: string },
  { template: any | null }
> = {
  name: 'get_template',
  description: 'Get a specific template by ID',
  category: 'local',
  allowWhenNetworkOff: true,
  riskLevel: 'LOW',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' }
    }
  },
  auditTemplate: {
    action: 'get_template',
    target: (input) => input.id
  },
  handler: async (input, context: SkillExecutionContext) => {
    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: 'get_template',
      approved: false,
      target: 'template',
      result: 'success'
    });

    const template = templateStore.getTemplate(input.id);

    return {
      template: template || null
    };
  }
};

/**
 * Create a new template skill
 */
export const create_template: SkillDefinition<
  {
    id: string;
    name: string;
    description: string;
    category: 'email' | 'call' | 'payment' | 'http' | 'custom';
    skillName: string;
    template: Record<string, unknown>;
    variables: string[];
    owner: string;
    enabled: boolean;
  },
  { id: string; success: boolean }
> = {
  name: 'create_template',
  description: 'Create a new template',
  category: 'local',
  allowWhenNetworkOff: true,
  riskLevel: 'MEDIUM',
  requiresApproval: true,
  inputSchema: {
    type: 'object',
    required: ['id', 'name', 'description', 'category', 'skillName', 'template', 'variables', 'owner', 'enabled'],
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      description: { type: 'string' },
      category: { type: 'string' },
      skillName: { type: 'string' },
      template: { type: 'object' },
      variables: { type: 'array' },
      owner: { type: 'string' },
      enabled: { type: 'boolean' }
    }
  },
  auditTemplate: {
    action: 'create_template',
    target: (input) => input.id
  },
  handler: async (input, context: SkillExecutionContext) => {
    const id = templateStore.addTemplate(input);

    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: 'create_template',
      approved: true,
      target: 'template',
      result: 'success'
    });

    return {
      id,
      success: true
    };
  }
};

/**
 * Apply a template to generate input skill
 */
export const apply_template: SkillDefinition<
  { templateId: string; variables: Record<string, unknown> },
  { input: Record<string, unknown> | null; success: boolean }
> = {
  name: 'apply_template',
  description: 'Apply a template with variables to generate skill input',
  category: 'local',
  allowWhenNetworkOff: true,
  riskLevel: 'LOW',
  requiresApproval: false,
  inputSchema: {
    type: 'object',
    required: ['templateId', 'variables'],
    properties: {
      templateId: { type: 'string' },
      variables: { type: 'object' }
    }
  },
  auditTemplate: {
    action: 'apply_template',
    target: (input) => input.templateId
  },
  handler: async (input, context: SkillExecutionContext) => {
    const result = templateStore.applyTemplate(input.templateId, input.variables);

    context.audit.log({
      timestamp: new Date().toISOString(),
      actor: context.actor,
      action: 'apply_template',
      approved: false,
      target: 'template',
      result: result ? 'success' : 'not_found'
    });

    return {
      input: result || null,
      success: result !== undefined
    };
  }
};
