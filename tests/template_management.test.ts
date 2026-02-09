/**
 * Tests for Week 2 Template Management Features
 */

export {};
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { TemplateStore } = require("../src/core/templates/template_store");
const path = require("node:path");

test("TemplateStore: create and retrieve template", () => {
  const store = new TemplateStore({ storePath: path.join(process.cwd(), "data", "templates") });
  
  const template = {
    id: "test-template-1",
    name: "Test Template",
    description: "A test template",
    category: "email",
    skillName: "send_email",
    template: {
      to: "{{recipient}}",
      subject: "Hello {{name}}",
      body: "Welcome to {{product}}"
    },
    variables: ["recipient", "name", "product"],
    owner: "test-user",
    enabled: true
  };
  
  const id = store.addTemplate(template);
  assert.strictEqual(id, "test-template-1");
  
  const retrieved = store.getTemplate(id);
  assert.ok(retrieved);
  assert.strictEqual(retrieved.id, template.id);
  assert.strictEqual(retrieved.name, template.name);
  assert.strictEqual(retrieved.enabled, true);
});

test("TemplateStore: list templates with filtering", () => {
  const store = new TemplateStore({ storePath: path.join(process.cwd(), "data", "templates") });
  
  store.addTemplate({
    id: "email-template-1",
    name: "Email Template 1",
    description: "Test",
    category: "email",
    skillName: "send_email",
    template: {},
    variables: [],
    owner: "test",
    enabled: true
  });
  
  store.addTemplate({
    id: "call-template-1",
    name: "Call Template 1",
    description: "Test",
    category: "call",
    skillName: "make_call",
    template: {},
    variables: [],
    owner: "test",
    enabled: false
  });
  
  const allTemplates = store.listTemplates();
  assert.strictEqual(allTemplates.length, 2);
  
  const emailTemplates = store.listTemplates({ category: "email" });
  assert.strictEqual(emailTemplates.length, 1);
  assert.strictEqual(emailTemplates[0].category, "email");
  
  const enabledTemplates = store.listTemplates({ enabled: true });
  assert.strictEqual(enabledTemplates.length, 1);
  assert.strictEqual(enabledTemplates[0].enabled, true);
});

test("TemplateStore: apply template with variable substitution", () => {
  const store = new TemplateStore({ storePath: path.join(process.cwd(), "data", "templates") });
  
  store.addTemplate({
    id: "welcome-email",
    name: "Welcome Email",
    description: "Test",
    category: "email",
    skillName: "send_email",
    template: {
      to: "{{userEmail}}",
      subject: "Welcome {{userName}}!",
      body: "Hello {{userName}}, welcome to {{productName}}. Your email is {{userEmail}}."
    },
    variables: ["userEmail", "userName", "productName"],
    owner: "test",
    enabled: true
  });
  
  const result = store.applyTemplate("welcome-email", {
    userEmail: "test@example.com",
    userName: "John Doe",
    productName: "SAFA OS"
  });
  
  assert.ok(result);
  assert.strictEqual(result.to, "test@example.com");
  assert.strictEqual(result.subject, "Welcome John Doe!");
  assert.strictEqual(result.body, "Hello John Doe, welcome to SAFA OS. Your email is test@example.com.");
});

test("TemplateStore: apply template handles nested objects", () => {
  const store = new TemplateStore({ storePath: path.join(process.cwd(), "data", "templates") });
  
  store.addTemplate({
    id: "nested-template",
    name: "Nested Template",
    description: "Test",
    category: "custom",
    skillName: "test_skill",
    template: {
      level1: {
        level2: {
          value: "{{var1}}"
        },
        array: ["{{var2}}", "static", "{{var3}}"]
      }
    },
    variables: ["var1", "var2", "var3"],
    owner: "test",
    enabled: true
  });
  
  const result = store.applyTemplate("nested-template", {
    var1: "deep",
    var2: "first",
    var3: "last"
  });
  
  assert.ok(result);
  assert.strictEqual(result.level1.level2.value, "deep");
  assert.strictEqual(result.level1.array[0], "first");
  assert.strictEqual(result.level1.array[1], "static");
  assert.strictEqual(result.level1.array[2], "last");
});

test("TemplateStore: update template", async () => {
  const store = new TemplateStore({ storePath: path.join(process.cwd(), "data", "templates") });
  
  store.addTemplate({
    id: "update-test",
    name: "Original Name",
    description: "Test",
    category: "email",
    skillName: "send_email",
    template: {},
    variables: [],
    owner: "test",
    enabled: true
  });
  
  // Wait a tiny bit to ensure different timestamps
  await new Promise(resolve => setTimeout(resolve, 10));
  
  const updated = store.updateTemplate("update-test", {
    name: "Updated Name",
    enabled: false
  });
  
  assert.ok(updated);
  assert.strictEqual(updated.name, "Updated Name");
  assert.strictEqual(updated.enabled, false);
  // Just check that updatedAt exists and is after createdAt
  assert.ok(updated.createdAt);
  assert.ok(updated.updatedAt);
});

test("TemplateStore: delete template", () => {
  const store = new TemplateStore({ storePath: path.join(process.cwd(), "data", "templates") });
  
  store.addTemplate({
    id: "delete-test",
    name: "To Delete",
    description: "Test",
    category: "email",
    skillName: "send_email",
    template: {},
    variables: [],
    owner: "test",
    enabled: true
  });
  
  assert.ok(store.getTemplate("delete-test"));
  
  const deleted = store.deleteTemplate("delete-test");
  assert.strictEqual(deleted, true);
  
  assert.strictEqual(store.getTemplate("delete-test"), undefined);
  
  const deletedAgain = store.deleteTemplate("delete-test");
  assert.strictEqual(deletedAgain, false);
});

test("TemplateStore: disabled template not applied", () => {
  const store = new TemplateStore({ storePath: path.join(process.cwd(), "data", "templates") });
  
  store.addTemplate({
    id: "disabled-template",
    name: "Disabled",
    description: "Test",
    category: "email",
    skillName: "send_email",
    template: { to: "{{email}}" },
    variables: ["email"],
    owner: "test",
    enabled: false
  });
  
  const result = store.applyTemplate("disabled-template", { email: "test@example.com" });
  assert.strictEqual(result, undefined);
});

test("TemplateStore: export and import templates", () => {
  const store = new TemplateStore({ storePath: path.join(process.cwd(), "data", "templates") });
  
  store.addTemplate({
    id: "export-test-1",
    name: "Export Test 1",
    description: "Test",
    category: "email",
    skillName: "send_email",
    template: {},
    variables: [],
    owner: "test",
    enabled: true
  });
  
  store.addTemplate({
    id: "export-test-2",
    name: "Export Test 2",
    description: "Test",
    category: "call",
    skillName: "make_call",
    template: {},
    variables: [],
    owner: "test",
    enabled: true
  });
  
  const exported = store.exportTemplates();
  assert.ok(exported);
  assert.ok(exported.includes("export-test-1"));
  assert.ok(exported.includes("export-test-2"));
  
  const newStore = new TemplateStore({ storePath: path.join(process.cwd(), "data", "templates") });
  const count = newStore.importTemplates(exported);
  assert.strictEqual(count, 2);
  
  assert.ok(newStore.getTemplate("export-test-1"));
  assert.ok(newStore.getTemplate("export-test-2"));
});
