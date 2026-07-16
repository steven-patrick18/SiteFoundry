/**
 * Renders a form from a template's param_schema (JSON Schema subset used by
 * SiteFoundry templates): object blocks -> sections; string fields with
 * format color/markdown/uri/email; enum -> select; boolean -> checkbox;
 * array<string> -> one-per-line textarea; array<object> -> repeatable cards.
 * Field errors from pre-flight are matched by dotted path (e.g. trust.email,
 * products[0].target_url).
 */

interface FieldSchema {
  type?: string;
  title?: string;
  format?: string;
  enum?: string[];
  default?: unknown;
  maxLength?: number;
  maxItems?: number;
  items?: FieldSchema & { properties?: Record<string, FieldSchema>; required?: string[] };
  properties?: Record<string, FieldSchema>;
  required?: string[];
}

export interface SchemaFormProps {
  schema: { properties?: Record<string, FieldSchema> };
  value: Record<string, any>;
  onChange: (next: Record<string, any>) => void;
  errors?: { field: string; message: string }[];
}

export default function SchemaForm({ schema, value, onChange, errors = [] }: SchemaFormProps) {
  const errorFor = (path: string) => errors.find((e) => e.field === path)?.message;

  const setPath = (blockKey: string, next: any) =>
    onChange({ ...value, [blockKey]: next });

  return (
    <div>
      {Object.entries(schema.properties ?? {}).map(([blockKey, block]) => {
        if (block.type === 'object') {
          return (
            <ObjectBlock
              key={blockKey}
              path={blockKey}
              schema={block}
              value={value[blockKey] ?? {}}
              onChange={(v) => setPath(blockKey, v)}
              errorFor={errorFor}
            />
          );
        }
        if (block.type === 'array') {
          return (
            <ArrayBlock
              key={blockKey}
              path={blockKey}
              schema={block}
              value={Array.isArray(value[blockKey]) ? value[blockKey] : []}
              onChange={(v) => setPath(blockKey, v)}
              errorFor={errorFor}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

function ObjectBlock({
  path, schema, value, onChange, errorFor,
}: {
  path: string;
  schema: FieldSchema;
  value: Record<string, any>;
  onChange: (v: Record<string, any>) => void;
  errorFor: (p: string) => string | undefined;
}) {
  return (
    <fieldset className="param-block">
      <legend>{schema.title ?? path}</legend>
      <div className="grid2">
        {Object.entries(schema.properties ?? {}).map(([key, field]) => (
          <ScalarField
            key={key}
            path={`${path}.${key}`}
            schema={field}
            required={schema.required?.includes(key) ?? false}
            value={value[key]}
            onChange={(v) => onChange({ ...value, [key]: v })}
            error={errorFor(`${path}.${key}`)}
          />
        ))}
      </div>
    </fieldset>
  );
}

function ArrayBlock({
  path, schema, value, onChange, errorFor,
}: {
  path: string;
  schema: FieldSchema;
  value: any[];
  onChange: (v: any[]) => void;
  errorFor: (p: string) => string | undefined;
}) {
  const items = schema.items;
  // array of strings -> textarea, one per line
  if (items?.type === 'string') {
    const err = errorFor(path) ?? value.map((_, i) => errorFor(`${path}[${i}]`)).find(Boolean);
    return (
      <fieldset className="param-block">
        <legend>{schema.title ?? path}</legend>
        <label>
          One per line
          <textarea
            rows={3}
            value={value.join('\n')}
            onChange={(e) => onChange(e.target.value.split('\n').filter((l) => l.trim() !== ''))}
          />
        </label>
        {err && <div className="error">{err}</div>}
      </fieldset>
    );
  }
  // array of objects -> repeatable cards
  return (
    <fieldset className="param-block">
      <legend>
        {schema.title ?? path}
        {schema.maxItems ? ` (max ${schema.maxItems})` : ''}
      </legend>
      {value.map((item, i) => (
        <div key={i} className="repeat-card">
          <div className="repeat-head">
            <span>#{i + 1}</span>
            <button type="button" className="danger" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
          <div className="grid2">
            {Object.entries(items?.properties ?? {}).map(([key, field]) =>
              field.type === 'array' && field.items?.type === 'string' ? (
                <label key={key}>
                  {field.title ?? key} (one per line)
                  <textarea
                    rows={3}
                    value={Array.isArray(item[key]) ? item[key].join('\n') : ''}
                    onChange={(e) => {
                      const next = [...value];
                      next[i] = { ...item, [key]: e.target.value.split('\n').filter((l) => l.trim() !== '') };
                      onChange(next);
                    }}
                  />
                </label>
              ) : (
                <ScalarField
                  key={key}
                  path={`${path}[${i}].${key}`}
                  schema={field}
                  required={items?.required?.includes(key) ?? false}
                  value={item[key]}
                  onChange={(v) => {
                    const next = [...value];
                    next[i] = { ...item, [key]: v };
                    onChange(next);
                  }}
                  error={errorFor(`${path}[${i}].${key}`)}
                />
              ),
            )}
          </div>
        </div>
      ))}
      <button
        type="button"
        disabled={!!schema.maxItems && value.length >= schema.maxItems}
        onClick={() => onChange([...value, {}])}
      >
        + Add {(schema.title ?? 'item').replace(/s$/, '').toLowerCase()}
      </button>
    </fieldset>
  );
}

function ScalarField({
  path, schema, required, value, onChange, error,
}: {
  path: string;
  schema: FieldSchema;
  required: boolean;
  value: any;
  onChange: (v: any) => void;
  error?: string;
}) {
  const title = `${schema.title ?? path.split('.').pop()}${required ? ' *' : ''}`;
  const current = value ?? schema.default ?? '';

  let input;
  if (schema.enum) {
    input = (
      <select value={current} onChange={(e) => onChange(e.target.value)}>
        {schema.enum.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  } else if (schema.type === 'boolean') {
    input = (
      <input
        type="checkbox"
        style={{ width: 'auto' }}
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  } else if (schema.format === 'markdown') {
    input = (
      <textarea rows={5} value={current} onChange={(e) => onChange(e.target.value)} />
    );
  } else if (schema.format === 'color') {
    input = (
      <input type="color" value={current || '#4f46e5'} onChange={(e) => onChange(e.target.value)} />
    );
  } else if (schema.type === 'number' || schema.type === 'integer') {
    input = (
      <input
        type="number"
        step="any"
        value={current}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
    );
  } else {
    input = (
      <input
        type="text"
        value={current}
        maxLength={schema.maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <label className={schema.format === 'markdown' ? 'span2' : undefined}>
      <span>
        {title}
        {schema.maxLength && typeof current === 'string' && (
          <span className="counter"> {current.length}/{schema.maxLength}</span>
        )}
      </span>
      {input}
      {error && <div className="error">{error}</div>}
    </label>
  );
}
