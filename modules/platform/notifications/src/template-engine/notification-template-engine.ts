import { NotificationChannel } from "../enums/notification-channel.js";
import {
  InvalidTemplateError,
  MissingTemplateVariableError,
  TemplateNotFoundError,
} from "../errors/notification-errors.js";

export interface NotificationTemplate {
  id: string;
  channel: NotificationChannel;
  subject?: string;
  body: string;
  requiredVariables?: string[];
}

export interface RenderResult {
  subject?: string;
  body: string;
}

export class NotificationTemplateEngine {
  private templates: Map<string, NotificationTemplate> = new Map();

  public registerTemplate(template: NotificationTemplate): void {
    if (!template.id || typeof template.id !== "string" || template.id.trim().length === 0) {
      throw new InvalidTemplateError("Template ID must be a non-empty string");
    }
    if (!template.body || typeof template.body !== "string" || template.body.trim().length === 0) {
      throw new InvalidTemplateError("Template body must be a non-empty string");
    }

    if (template.subject) {
      this.validateTemplateSyntax(template.subject, `${template.id}.subject`);
    }
    this.validateTemplateSyntax(template.body, `${template.id}.body`);

    this.templates.set(template.id, {
      ...template,
      requiredVariables: template.requiredVariables ?? [],
    });
  }

  public getTemplate(id: string): NotificationTemplate | undefined {
    return this.templates.get(id);
  }

  public renderTemplate(
    templateId: string,
    variables: Record<string, unknown>
  ): RenderResult {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new TemplateNotFoundError(templateId);
    }

    const bodyVars = this.extractVariables(template.body);
    const subjectVars = template.subject ? this.extractVariables(template.subject) : [];
    const allRequiredInTemplate = new Set<string>([
      ...(template.requiredVariables ?? []),
      ...bodyVars,
      ...subjectVars,
    ]);

    const missing: string[] = [];
    for (const varName of allRequiredInTemplate) {
      const val = this.getNestedValue(variables, varName);
      if (val === undefined || val === null) {
        missing.push(varName);
      }
    }

    if (missing.length > 0) {
      throw new MissingTemplateVariableError(missing, templateId);
    }

    const renderedBody = this.interpolate(template.body, variables);
    const renderedSubject = template.subject
      ? this.interpolate(template.subject, variables)
      : undefined;

    return {
      subject: renderedSubject,
      body: renderedBody,
    };
  }

  public renderInline(
    templateString: string,
    variables: Record<string, unknown>,
    explicitRequiredVars?: string[]
  ): string {
    this.validateTemplateSyntax(templateString, "inline");

    const extractedVars = this.extractVariables(templateString);
    const requiredSet = new Set<string>([
      ...(explicitRequiredVars ?? []),
      ...extractedVars,
    ]);

    const missing: string[] = [];
    for (const varName of requiredSet) {
      const val = this.getNestedValue(variables, varName);
      if (val === undefined || val === null) {
        missing.push(varName);
      }
    }

    if (missing.length > 0) {
      throw new MissingTemplateVariableError(missing);
    }

    return this.interpolate(templateString, variables);
  }

  public validateTemplateSyntax(
    templateString: string,
    contextName = "template"
  ): { valid: boolean; extractedVariables: string[] } {
    if (typeof templateString !== "string") {
      throw new InvalidTemplateError(`Invalid ${contextName}: template must be a string`);
    }

    let depth = 0;
    for (let i = 0; i < templateString.length - 1; i++) {
      if (templateString[i] === "{" && templateString[i + 1] === "{") {
        if (depth > 0) {
          throw new InvalidTemplateError(
            `Malformed ${contextName}: nested '{{' detected`
          );
        }
        depth++;
        i++;
      } else if (templateString[i] === "}" && templateString[i + 1] === "}") {
        if (depth === 0) {
          throw new InvalidTemplateError(
            `Malformed ${contextName}: unexpected closing '}}' without opening '{{'`
          );
        }
        depth--;
        i++;
      }
    }

    if (depth !== 0) {
      throw new InvalidTemplateError(
        `Malformed ${contextName}: unclosed '{{' placeholder`
      );
    }

    const regex = /\{\{\s*([^{}\s]*)\s*\}\}/g;
    let match: RegExpExecArray | null;
    const extractedVariables: string[] = [];

    while ((match = regex.exec(templateString)) !== null) {
      const varName = match[1];
      if (!varName || varName.trim().length === 0) {
        throw new InvalidTemplateError(
          `Malformed ${contextName}: empty placeholder '{{}}' is not allowed`
        );
      }
      if (!/^[a-zA-Z_$][a-zA-Z0-9_$.-]*$/.test(varName)) {
        throw new InvalidTemplateError(
          `Malformed ${contextName}: invalid placeholder variable name '${varName}'`
        );
      }
      if (!extractedVariables.includes(varName)) {
        extractedVariables.push(varName);
      }
    }

    return { valid: true, extractedVariables };
  }

  public extractVariables(templateString: string): string[] {
    const { extractedVariables } = this.validateTemplateSyntax(templateString);
    return extractedVariables;
  }

  private interpolate(
    templateString: string,
    variables: Record<string, unknown>
  ): string {
    return templateString.replace(/\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$.-]*)\s*\}\}/g, (_, varName) => {
      const val = this.getNestedValue(variables, varName);
      if (val === undefined || val === null) {
        return "";
      }
      if (typeof val === "object") {
        return JSON.stringify(val);
      }
      return String(val);
    });
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    if (!obj || typeof obj !== "object") return undefined;
    if (path in obj) return obj[path];

    const parts = path.split(".");
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
}
