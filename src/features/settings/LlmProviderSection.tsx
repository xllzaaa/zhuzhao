/**
 * Settings · LLM Provider 配置区
 *
 * 功能：
 * - 列出所有已配置 provider
 * - 当前 active provider 高亮显示
 * - 新增 / 编辑 / 删除 provider
 * - 单条 provider 「测试连接」按钮
 * - 顶部「测试 active 连接」按钮（即使未在编辑也可用）
 *
 * 安全：
 * - api_key 在 UI 中永不以明文展示
 * - 编辑时 api_key 字段为空，留空表示不修改；填入则覆盖
 * - 列表仅显示「已配置」「未配置」标签
 */

import { useEffect, useState } from "react";
import {
  Cpu,
  Plus,
  Pencil,
  Trash2,
  Plug,
  CheckCircle2,
  Loader2,
  AlertCircle,
  X,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { LlmProviderRow } from "@/types/db";
import {
  listAll,
  createProvider,
  updateProvider,
  deleteProvider,
  type CreateProviderInput,
  type UpdateProviderInput,
} from "@/lib/repositories/llm-provider-repo";
import {
  testProviderConnection,
  testActiveProviderConnection,
  formatTestConnectionResult,
} from "@/lib/llm/test-connection";

// 常见 provider 类型，用户也可手动填 custom
const PROVIDER_TYPES = [
  { value: "openai", label: "OpenAI", defaultBaseUrl: "https://api.openai.com", defaultModel: "gpt-4o-mini" },
  { value: "deepseek", label: "DeepSeek", defaultBaseUrl: "https://api.deepseek.com", defaultModel: "deepseek-chat" },
  { value: "moonshot", label: "Moonshot (Kimi)", defaultBaseUrl: "https://api.moonshot.cn", defaultModel: "moonshot-v1-8k" },
  { value: "openrouter", label: "OpenRouter", defaultBaseUrl: "https://openrouter.ai/api", defaultModel: "openai/gpt-4o-mini" },
  { value: "custom", label: "自定义 / 第三方中转", defaultBaseUrl: "", defaultModel: "" },
] as const;

// 表单字段定义
interface FormState {
  name: string;
  provider_type: string;
  base_url: string;
  api_key: string; // 表单中的值；编辑时空字符串表示"不修改"
  model: string;
  temperature: string;
  max_tokens: string;
  is_active: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  provider_type: "openai",
  base_url: "https://api.openai.com",
  api_key: "",
  model: "gpt-4o-mini",
  temperature: "0.3",
  max_tokens: "1024",
  is_active: true,
};

export function LlmProviderSection() {
  const [providers, setProviders] = useState<LlmProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [activeTestId, setActiveTestId] = useState<string | null>(null);
  const [testingActive, setTestingActive] = useState(false);

  const activeProvider = providers.find((p) => p.is_active === 1) ?? null;

  // 加载列表
  const reload = async () => {
    setLoading(true);
    try {
      const list = await listAll();
      setProviders(list);
    } catch (err) {
      toast.error("加载 provider 列表失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  // 打开新增表单
  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIsFormOpen(true);
  };

  // 打开编辑表单
  const openEdit = (p: LlmProviderRow) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      provider_type: p.provider_type,
      base_url: p.base_url,
      api_key: "", // 编辑时空，表示不修改
      model: p.model,
      temperature: String(p.temperature),
      max_tokens: String(p.max_tokens),
      is_active: p.is_active === 1,
    });
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  // 选择 provider_type 时联动默认 base_url / model（仅当字段为空或与上一个默认值一致时）
  const onProviderTypeChange = (value: string) => {
    const t = PROVIDER_TYPES.find((p) => p.value === value);
    if (!t) return;
    // 若当前 base_url 为空 / 等于其它类型的默认值，则切换到新类型的默认值
    const prevType = PROVIDER_TYPES.find((p) => p.value === form.provider_type);
    const shouldOverrideBaseUrl =
      !form.base_url ||
      (prevType && form.base_url === prevType.defaultBaseUrl);
    const shouldOverrideModel =
      !form.model ||
      (prevType && form.model === prevType.defaultModel);
    setForm((f) => ({
      ...f,
      provider_type: value,
      base_url: shouldOverrideBaseUrl ? t.defaultBaseUrl : f.base_url,
      model: shouldOverrideModel ? t.defaultModel : f.model,
    }));
  };

  // 保存（新增 / 编辑）
  const handleSave = async () => {
    // 基础校验
    if (!form.name.trim()) {
      toast.error("请填写 provider name");
      return;
    }
    if (!form.base_url.trim()) {
      toast.error("请填写 base_url");
      return;
    }
    if (!form.model.trim()) {
      toast.error("请填写 model");
      return;
    }
    const temperature = parseFloat(form.temperature);
    if (Number.isNaN(temperature) || temperature < 0 || temperature > 2) {
      toast.error("temperature 必须为 0~2 之间的数字");
      return;
    }
    const maxTokens = parseInt(form.max_tokens, 10);
    if (Number.isNaN(maxTokens) || maxTokens <= 0) {
      toast.error("max_tokens 必须为正整数");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        // 编辑：构造 patch
        const patch: UpdateProviderInput = {
          name: form.name.trim(),
          provider_type: form.provider_type,
          base_url: form.base_url.trim(),
          model: form.model.trim(),
          temperature,
          max_tokens: maxTokens,
          is_active: form.is_active,
        };
        // api_key：仅当用户填入新值时才更新
        if (form.api_key.trim().length > 0) {
          patch.api_key = form.api_key.trim();
        }
        // 否则不传 api_key，保持原值
        await updateProvider(editingId, patch);
        toast.success(`已更新 provider「${form.name.trim()}」`);
      } else {
        // 新增
        const input: CreateProviderInput = {
          name: form.name.trim(),
          provider_type: form.provider_type,
          base_url: form.base_url.trim(),
          model: form.model.trim(),
          temperature,
          max_tokens: maxTokens,
          is_active: form.is_active,
          // api_key 可为空字符串 → 视为 null
          api_key: form.api_key.trim() || null,
        };
        await createProvider(input);
        toast.success(`已创建 provider「${form.name.trim()}」`);
      }
      closeForm();
      await reload();
    } catch (err) {
      toast.error("保存失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  // 删除
  const handleDelete = async (p: LlmProviderRow) => {
    if (!confirm(`确定删除 provider「${p.name}」？此操作不可撤销。`)) return;
    try {
      await deleteProvider(p.id);
      toast.success(`已删除 provider「${p.name}」`);
      await reload();
    } catch (err) {
      toast.error("删除失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // 设为 active
  const handleSetActive = async (p: LlmProviderRow) => {
    try {
      await updateProvider(p.id, { is_active: true });
      toast.success(`已将「${p.name}」设为 active`);
      await reload();
    } catch (err) {
      toast.error("设置 active 失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // 测试单条 provider 连接
  const handleTestOne = async (p: LlmProviderRow) => {
    setActiveTestId(p.id);
    try {
      const result = await testProviderConnection(p);
      const formatted = formatTestConnectionResult(result);
      if (formatted.variant === "success") {
        toast.success(formatted.title, { description: formatted.description });
      } else {
        toast.error(formatted.title, { description: formatted.description });
      }
    } catch (err) {
      // 兜底：testProviderConnection 已 try/catch，但再加一层
      toast.error("测试连接时发生未预期错误", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setActiveTestId(null);
    }
  };

  // 测试当前 active provider 连接
  const handleTestActive = async () => {
    setTestingActive(true);
    try {
      const result = await testActiveProviderConnection();
      const formatted = formatTestConnectionResult(result);
      if (formatted.variant === "success") {
        toast.success(formatted.title, { description: formatted.description });
      } else {
        toast.error(formatted.title, { description: formatted.description });
      }
    } catch (err) {
      toast.error("测试连接时发生未预期错误", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTestingActive(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">LLM Provider</h3>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
            Phase 4
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleTestActive}
            disabled={testingActive || !activeProvider}
          >
            {testingActive ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plug className="h-3.5 w-3.5" />
            )}
            测试 active 连接
          </Button>
          <Button size="sm" onClick={openCreate} disabled={isFormOpen}>
            <Plus className="h-3.5 w-3.5" />
            新增
          </Button>
        </div>
      </div>

      {/* Active Provider 状态条 */}
      <div
        className={cn(
          "rounded-md border p-3 text-xs",
          activeProvider
            ? "border-primary/30 bg-primary/5 text-foreground"
            : "border-border bg-muted/40 text-muted-foreground",
        )}
      >
        <div className="flex items-center gap-2">
          {activeProvider ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              <span>
                当前 active：
                <span className="ml-1 font-medium text-foreground">
                  {activeProvider.name}
                </span>
                <span className="ml-2 text-muted-foreground">
                  ({activeProvider.provider_type} · {activeProvider.model})
                </span>
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="h-3.5 w-3.5" />
              <span>未配置 active provider，请先新增并勾选 is_active。</span>
            </>
          )}
        </div>
      </div>

      {/* 表单 */}
      {isFormOpen && (
        <ProviderForm
          form={form}
          editingId={editingId}
          saving={saving}
          onFormChange={setForm}
          onProviderTypeChange={onProviderTypeChange}
          onSave={handleSave}
          onCancel={closeForm}
        />
      )}

      {/* 列表 */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            加载中...
          </div>
        ) : providers.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            尚未配置任何 provider。点击右上「新增」开始。
          </div>
        ) : (
          providers.map((p) => (
            <ProviderRow
              key={p.id}
              provider={p}
              isActive={p.is_active === 1}
              hasApiKey={Boolean(p.api_key)}
              testing={activeTestId === p.id}
              onEdit={() => openEdit(p)}
              onDelete={() => handleDelete(p)}
              onSetActive={() => handleSetActive(p)}
              onTest={() => handleTestOne(p)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 子组件：单行 Provider
// ---------------------------------------------------------------------------

interface ProviderRowProps {
  provider: LlmProviderRow;
  isActive: boolean;
  hasApiKey: boolean;
  testing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetActive: () => void;
  onTest: () => void;
}

function ProviderRow({
  provider,
  isActive,
  hasApiKey,
  testing,
  onEdit,
  onDelete,
  onSetActive,
  onTest,
}: ProviderRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-md border bg-card p-3",
        isActive ? "border-primary/40" : "border-border",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {provider.name}
          </span>
          {isActive && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">
              active
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>type: {provider.provider_type}</span>
          <span>·</span>
          <span className="truncate">model: {provider.model}</span>
          <span>·</span>
          <span className="truncate">{provider.base_url}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <KeyRound className="h-3 w-3" />
            {hasApiKey ? (
              <span className="text-foreground/70">已配置</span>
            ) : (
              <span className="text-destructive">未配置</span>
            )}
          </span>
          <span>·</span>
          <span>
            T={provider.temperature}, max_tokens={provider.max_tokens}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={onTest}
          disabled={testing}
          title="测试此 provider 的连接"
        >
          {testing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plug className="h-3.5 w-3.5" />
          )}
          测试
        </Button>
        {!isActive && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onSetActive}
            title="设为 active"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            设为 active
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onEdit}
          title="编辑"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          title="删除"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 子组件：表单
// ---------------------------------------------------------------------------

interface ProviderFormProps {
  form: FormState;
  editingId: string | null;
  saving: boolean;
  onFormChange: (f: FormState) => void;
  onProviderTypeChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

function ProviderForm({
  form,
  editingId,
  saving,
  onFormChange,
  onProviderTypeChange,
  onSave,
  onCancel,
}: ProviderFormProps) {
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    onFormChange({ ...form, [key]: value });
  };

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-medium">
          {editingId ? `编辑 provider` : "新增 provider"}
        </h4>
        <Button size="icon" variant="ghost" onClick={onCancel} className="h-7 w-7">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* name */}
        <FormField label="Provider Name" required>
          <Input
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="例如：my-openai"
            className="h-8 text-xs"
          />
        </FormField>

        {/* provider_type */}
        <FormField label="Provider Type" required>
          <select
            value={form.provider_type}
            onChange={(e) => onProviderTypeChange(e.target.value)}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {PROVIDER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </FormField>

        {/* base_url */}
        <FormField label="Base URL" required fullWidth>
          <Input
            value={form.base_url}
            onChange={(e) => update("base_url", e.target.value)}
            placeholder="https://api.openai.com 或 https://your-proxy.com/v1"
            className="h-8 text-xs"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            支持第三方中转 API。结尾可带或不带 /v1，系统会自动处理。
          </p>
        </FormField>

        {/* api_key - 安全字段 */}
        <FormField
          label="API Key"
          fullWidth
          badge={
            editingId ? (
              <span className="text-[10px] text-muted-foreground">
                留空则不修改
              </span>
            ) : null
          }
        >
          <Input
            type="password"
            value={form.api_key}
            onChange={(e) => update("api_key", e.target.value)}
            placeholder={
              editingId
                ? "留空则保留原 api_key；填入则覆盖"
                : "sk-... （仅本地保存，不上传）"
            }
            autoComplete="off"
            spellCheck={false}
            className="h-8 text-xs"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            <span className="text-primary">安全提示：</span>
            API Key 仅保存在本地 SQLite，不会上传，不会写入日志，UI 不会明文长期显示。
          </p>
        </FormField>

        {/* model */}
        <FormField label="Model" required>
          <Input
            value={form.model}
            onChange={(e) => update("model", e.target.value)}
            placeholder="gpt-4o-mini / deepseek-chat / ..."
            className="h-8 text-xs"
          />
        </FormField>

        {/* temperature */}
        <FormField label="Temperature (0~2)">
          <Input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={form.temperature}
            onChange={(e) => update("temperature", e.target.value)}
            className="h-8 text-xs"
          />
        </FormField>

        {/* max_tokens */}
        <FormField label="Max Tokens">
          <Input
            type="number"
            min={1}
            step={1}
            value={form.max_tokens}
            onChange={(e) => update("max_tokens", e.target.value)}
            className="h-8 text-xs"
          />
        </FormField>

        {/* is_active */}
        <FormField label="Active">
          <label className="flex h-8 items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => update("is_active", e.target.checked)}
              className="h-3.5 w-3.5 rounded border-input"
            />
            <span className="text-muted-foreground">
              设为当前使用的 provider（同时仅一个 active）
            </span>
          </label>
        </FormField>
      </div>

      {/* 操作按钮 */}
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          取消
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          {editingId ? "保存修改" : "创建"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 表单字段 wrapper
// ---------------------------------------------------------------------------

interface FormFieldProps {
  label: string;
  required?: boolean;
  fullWidth?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}

function FormField({
  label,
  required,
  fullWidth,
  badge,
  children,
}: FormFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1", fullWidth && "col-span-2")}>
      <label className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
        <span>
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </span>
        {badge}
      </label>
      {children}
    </div>
  );
}
