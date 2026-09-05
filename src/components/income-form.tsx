import { useEffect, useState, type FormEvent } from 'react';
import { getBackend } from '../backend';
import { INCOME_CATEGORIES } from '../lib/constants';
import { parseAmount, todayISO } from '../lib/format';
import type { IncomeEntry } from '../lib/types';
import { Modal } from './ui/overlays';
import { Button, Alert } from './ui/primitives';
import { Field, Input, Select, Textarea } from './ui/forms';

export function IncomeFormModal({
  open,
  onClose,
  onSaved,
  entry,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (entry: IncomeEntry) => void;
  entry: IncomeEntry | null;
}) {
  const editing = Boolean(entry);
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('');
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState('Freelance');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(entry ? String(entry.amount) : '');
    setSource(entry?.source ?? '');
    setDate(entry?.income_date ?? todayISO());
    setCategory(entry?.category ?? 'Freelance');
    setNotes(entry?.notes ?? '');
    setError(null);
  }, [open, entry]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const value = parseAmount(amount);
    if (value === null || value <= 0) {
      setError('Please enter a valid amount greater than zero.');
      return;
    }
    if (!source.trim()) {
      setError('Please enter a client or source.');
      return;
    }
    if (!date) {
      setError('Please pick a date.');
      return;
    }
    setSaving(true);
    try {
      const backend = getBackend();
      const payload = {
        amount: value,
        source: source.trim(),
        income_date: date,
        category,
        notes: notes.trim() || null,
      };
      const saved = entry
        ? await backend.updateIncome(entry.id, payload)
        : await backend.createIncome(payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this entry. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit income' : 'Add income'}
      description="Track a payment you received for your work."
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="income-form" loading={saving}>
            {editing ? 'Save changes' : 'Add income'}
          </Button>
        </div>
      }
    >
      <form id="income-form" onSubmit={onSubmit} className="space-y-4" noValidate>
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
        <Field label="Client / source" required>
          <Input
            placeholder="e.g. Acme Studios"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </Field>
        <Field label="Category" required>
          <Select options={INCOME_CATEGORIES} value={category} onChange={(e) => setCategory(e.target.value)} />
        </Field>
        <Field label="Notes">
          <Textarea
            placeholder="Optional — project name, invoice #, etc."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}