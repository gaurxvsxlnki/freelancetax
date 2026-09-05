import { useEffect, useState, type FormEvent } from 'react';
import { getBackend } from '../backend';
import { EXPENSE_CATEGORIES } from '../lib/constants';
import { parseAmount, todayISO } from '../lib/format';
import type { ExpenseEntry } from '../lib/types';
import { Modal } from './ui/overlays';
import { Button, Alert } from './ui/primitives';
import { Field, Input, Select, Textarea, Toggle } from './ui/forms';

export function ExpenseFormModal({
  open,
  onClose,
  onSaved,
  entry,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (entry: ExpenseEntry) => void;
  entry: ExpenseEntry | null;
  /** Optional initial values (e.g. from a receipt review). */
  defaults?: Partial<ExpenseEntry>;
}) {
  const editing = Boolean(entry);
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState('Software');
  const [businessUse, setBusinessUse] = useState('100');
  const [isBusiness, setIsBusiness] = useState(true);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(entry ? String(entry.amount) : defaults?.amount != null ? String(defaults.amount) : '');
    setMerchant(entry?.merchant ?? defaults?.merchant ?? '');
    setDate(entry?.expense_date ?? defaults?.expense_date ?? todayISO());
    setCategory(entry?.category ?? defaults?.category ?? 'Software');
    setBusinessUse(String(entry?.business_use_percentage ?? defaults?.business_use_percentage ?? 100));
    setIsBusiness(entry?.is_business_expense ?? defaults?.is_business_expense ?? true);
    setNotes(entry?.notes ?? defaults?.notes ?? '');
    setError(null);
  }, [open, entry, defaults]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const value = parseAmount(amount);
    if (value === null || value <= 0) {
      setError('Please enter a valid amount greater than zero.');
      return;
    }
    if (!merchant.trim()) {
      setError('Please enter a merchant or description.');
      return;
    }
    if (!date) {
      setError('Please pick a date.');
      return;
    }
    const usePct = Math.round(Number(businessUse));
    if (!Number.isFinite(usePct) || usePct < 0 || usePct > 100) {
      setError('Business use percentage must be between 0 and 100.');
      return;
    }
    setSaving(true);
    try {
      const backend = getBackend();
      const payload = {
        amount: value,
        merchant: merchant.trim(),
        expense_date: date,
        category,
        business_use_percentage: usePct,
        is_business_expense: isBusiness,
        notes: notes.trim() || null,
      };
      const saved = entry
        ? await backend.updateExpense(entry.id, payload)
        : await backend.createExpense(payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this expense. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit expense' : 'Add expense'}
      description="Log a business or personal expense."
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="expense-form" loading={saving}>
            {editing ? 'Save changes' : 'Add expense'}
          </Button>
        </div>
      }
    >
      <form id="expense-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && (
          <Alert variant="danger" title="Unable to save">
            {error}
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount" required>
            <Input
              prefix="$"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Date" required>
            <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Merchant / description" required>
          <Input
            placeholder="e.g. Adobe Creative Cloud"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
          />
        </Field>
        <Field label="Category" required>
          <Select options={EXPENSE_CATEGORIES} value={category} onChange={(e) => setCategory(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Business use"
            hint="% of this expense used for business"
            required
          >
            <Input
              type="number"
              min={0}
              max={100}
              step={5}
              inputMode="numeric"
              value={businessUse}
              onChange={(e) => setBusinessUse(e.target.value)}
            />
          </Field>
          <div className="flex items-end pb-1">
            <Toggle
              checked={isBusiness}
              onChange={setIsBusiness}
              label="Business expense"
              description={isBusiness ? 'Included in deductions' : 'Marked as personal'}
            />
          </div>
        </div>
        <Field label="Notes">
          <Textarea
            placeholder="Optional — what was this for?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}