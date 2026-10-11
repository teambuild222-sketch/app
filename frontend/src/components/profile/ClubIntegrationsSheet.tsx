import React, { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { apiErrorMessage } from '../../api/client';
import type { JoinFormField } from '../../api/communitiesApi';
import {
  disconnectNotion,
  fetchNotionStatus,
  saveJoinForm,
  selectNotionDatabase,
  startNotionOAuth,
  syncNotionNow,
  type NotionStatus,
} from '../../api/notionApi';
import type { Community } from './communitiesStore';
import './ClubIntegrationsSheet.css';

const FIELD_TYPES = ['title', 'text', 'email', 'phone', 'number', 'date', 'url', 'checkbox', 'select'];

type Props = {
  community: Community;
  onClose: () => void;
};

export function ClubIntegrationsSheet({ community, onClose }: Props) {
  const [status, setStatus] = useState<NotionStatus | null>(null);
  const [fields, setFields] = useState<JoinFormField[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  useEffect(() => {
    let live = true;
    fetchNotionStatus(community.id)
      .then((row) => {
        if (!live) return;
        setStatus(row);
        setFields(row.fields.length ? row.fields : []);
      })
      .catch((err) => toast.error(apiErrorMessage(err, 'Could not load integrations')));
    return () => {
      live = false;
    };
  }, [community.id]);

  const locked = status?.status === 'locked' || !status?.verified;

  const persistFields = async () => {
    setBusy(true);
    try {
      const next = await saveJoinForm(community.id, fields);
      setStatus(next);
      toast.success('Join sheet updated');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not save fields'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="club-int-overlay" onClick={onClose}>
      <div className="club-int-sheet animate-slideUp" onClick={(e) => e.stopPropagation()}>
        <header className="club-int-header">
          <div>
            <p className="club-int-kicker">Integrations</p>
            <h3>{community.name}</h3>
          </div>
          <button type="button" className="club-int-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <section className="club-int-card">
          <div className="club-int-card-top">
            <strong>Notion</strong>
            <span className={`club-int-pill club-int-pill--${status?.status || 'loading'}`}>
              {labelFor(status?.status)}
            </span>
          </div>
          <p className="club-int-note">
            Join answers from official events are written into this club’s Notion database. Only this
            club can see them. Leaving an event does not change Notion.
          </p>

          {locked ? (
            <p className="club-int-lock">
              Get verified: our team marks official community pages after the requirements are
              fulfilled in person. Notion unlocks after that.
            </p>
          ) : (
            <>
              {status?.workspaceName && (
                <p className="club-int-workspace">
                  Workspace: {status.workspaceName}
                  {status.databaseTitle ? ` · ${status.databaseTitle}` : ''}
                </p>
              )}
              {status?.lastError === 'reconnect_required' || status?.status === 'needs_reconnect' ? (
                <p className="club-int-lock">Notion needs reconnect. Tokens expired or were revoked.</p>
              ) : null}
              <div className="club-int-actions">
                <button type="button" disabled={busy} onClick={() => startNotionOAuth(community.id)}>
                  {status?.status === 'not_connected' ? 'Connect Notion' : 'Choose pages'}
                </button>
                {status?.status === 'connected' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await syncNotionNow(community.id);
                        toast.success('Sync queued');
                      } catch (err) {
                        toast.error(apiErrorMessage(err));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Sync now
                  </button>
                )}
                {status && status.status !== 'not_connected' && status.status !== 'locked' && (
                  <button type="button" className="danger" onClick={() => setConfirmOff(true)}>
                    Disconnect
                  </button>
                )}
              </div>
              {status && status.databases.length > 0 && (
                <label className="club-int-field">
                  <span>Roster database</span>
                  <select
                    value={status.databaseId}
                    onChange={async (e) => {
                      setBusy(true);
                      try {
                        setStatus(await selectNotionDatabase(community.id, e.target.value));
                      } catch (err) {
                        toast.error(apiErrorMessage(err));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <option value="">Select a shared database</option>
                    {status.databases.map((db) => (
                      <option key={db.id} value={db.id}>
                        {db.title || db.id}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
        </section>

        {!locked && (
          <section className="club-int-card">
            <div className="club-int-card-top">
              <strong>Join sheet</strong>
              <button type="button" className="ghost" onClick={persistFields} disabled={busy}>
                Save columns
              </button>
            </div>
            <p className="club-int-note">
              Editable like a spreadsheet. Each column becomes a Notion property automatically.
            </p>
            <div className="club-int-sheet-head">
              <span>Field</span>
              <span>Type</span>
              <span>Required</span>
              <span />
            </div>
            {fields.map((field, index) => (
              <div key={field.id} className="club-int-sheet-row">
                <input
                  value={field.key}
                  onChange={(e) =>
                    setFields((rows) =>
                      rows.map((row, i) => (i === index ? { ...row, key: e.target.value } : row)),
                    )
                  }
                />
                <select
                  value={field.type}
                  onChange={(e) =>
                    setFields((rows) =>
                      rows.map((row, i) => (i === index ? { ...row, type: e.target.value } : row)),
                    )
                  }
                >
                  {FIELD_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) =>
                    setFields((rows) =>
                      rows.map((row, i) => (i === index ? { ...row, required: e.target.checked } : row)),
                    )
                  }
                />
                <button
                  type="button"
                  className="icon"
                  onClick={() => setFields((rows) => rows.filter((_, i) => i !== index))}
                  aria-label="Remove column"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="club-int-add"
              onClick={() =>
                setFields((rows) => [
                  ...rows,
                  { id: `fld_${Date.now()}`, key: 'New field', type: 'text', required: false },
                ])
              }
            >
              <Plus size={14} /> Add column
            </button>
          </section>
        )}

        {confirmOff && (
          <div className="club-int-confirm">
            <p>Disconnect Notion? Tokens are removed here. Existing Notion pages stay in their workspace.</p>
            <div className="club-int-actions">
              <button type="button" onClick={() => setConfirmOff(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await disconnectNotion(community.id);
                    setStatus(await fetchNotionStatus(community.id));
                    setConfirmOff(false);
                    toast.success('Disconnected');
                  } catch (err) {
                    toast.error(apiErrorMessage(err));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function labelFor(status?: string) {
  if (status === 'connected') return 'Connected';
  if (status === 'needs_reconnect') return 'Needs reconnect';
  if (status === 'paused') return 'Paused';
  if (status === 'locked') return 'Get verified';
  if (status === 'not_connected') return 'Not connected';
  return 'Loading';
}
