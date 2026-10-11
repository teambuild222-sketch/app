import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { JoinFormField } from '../../api/communitiesApi';
import { registerJoinFormHandler, type JoinFormRequest } from '../../lib/joinFormGate';
import './JoinFormModal.css';

export function JoinFormModal() {
  const [request, setRequest] = useState<JoinFormRequest | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [resolve, setResolve] = useState<((value: Record<string, string> | null) => void) | null>(null);

  useEffect(() => {
    registerJoinFormHandler(
      (next) =>
        new Promise((done) => {
          setAnswers({});
          setRequest(next);
          setResolve(() => done);
        }),
    );
    return () => registerJoinFormHandler(null);
  }, []);

  if (!request) return null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    resolve?.(answers);
    setRequest(null);
    setResolve(null);
  };

  const cancel = () => {
    resolve?.(null);
    setRequest(null);
    setResolve(null);
  };

  return (
    <div className="join-form-overlay" onClick={cancel}>
      <div className="join-form-sheet animate-slideUp" onClick={(e) => e.stopPropagation()}>
        <header className="join-form-header">
          <div>
            <h3>Join {request.communityName || 'this event'}</h3>
            <p>Official club event — these answers go to the club’s Notion roster.</p>
          </div>
          <button type="button" className="join-form-close" onClick={cancel} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <form onSubmit={submit} className="join-form-body">
          {request.fields.map((field) => (
            <label key={field.id} className="join-form-field">
              <span>
                {field.key}
                {field.required ? ' *' : ''}
              </span>
              {renderInput(field, answers[field.key] ?? '', (value) =>
                setAnswers((prev) => ({ ...prev, [field.key]: value })),
              )}
            </label>
          ))}
          <button type="submit" className="join-form-submit">
            Join event
          </button>
        </form>
      </div>
    </div>
  );
}

function renderInput(
  field: JoinFormField,
  value: string,
  onChange: (value: string) => void,
) {
  if (field.type === 'checkbox') {
    return (
      <input
        type="checkbox"
        checked={value === 'true'}
        onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
      />
    );
  }
  const type =
    field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'url' ? 'url' : 'text';
  return (
    <input
      type={type}
      required={field.required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.key}
    />
  );
}
