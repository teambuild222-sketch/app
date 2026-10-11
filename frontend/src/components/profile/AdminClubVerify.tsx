import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { apiErrorMessage } from '../../api/client';
import { listAdminClubs, setClubVerified, type AdminClub } from '../../api/adminClubsApi';
import './AdminClubVerify.css';

export function AdminClubVerify() {
  const [clubs, setClubs] = useState<AdminClub[] | null>(null);

  const reload = () =>
    listAdminClubs()
      .then(setClubs)
      .catch((err) => toast.error(apiErrorMessage(err, 'Could not load clubs')));

  useEffect(() => {
    void reload();
  }, []);

  if (!clubs) return null;

  return (
    <section className="admin-clubs">
      <h3>Team review</h3>
      <p>Mark a club verified after the requirements are personally fulfilled. This unlocks Notion.</p>
      <div className="admin-clubs-list">
        {clubs.map((club) => (
          <article key={club.id} className="admin-club-card">
            <div className="admin-club-top">
              <img src={club.avatarUrl || undefined} alt="" />
              <div>
                <strong>{club.name}</strong>
                <span>
                  {club.memberCount} members · {club.verified ? 'Verified' : 'Not verified'} · Notion{' '}
                  {club.notionStatus}
                </span>
              </div>
            </div>
            <ul>
              {club.requirements.map((req) => (
                <li key={req.id} className={req.met ? 'met' : ''}>
                  {req.met ? '✓' : '○'} {req.label}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={async () => {
                try {
                  const next = await setClubVerified(club.id, !club.verified);
                  setClubs((rows) => rows?.map((row) => (row.id === club.id ? next : row)) ?? [next]);
                  toast.success(next.verified ? 'Club verified' : 'Verification paused');
                } catch (err) {
                  toast.error(apiErrorMessage(err));
                }
              }}
            >
              {club.verified ? 'Unverify' : 'Mark verified'}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
