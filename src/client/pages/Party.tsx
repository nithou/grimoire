import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crown, Flame, Focus, RefreshCw, Shield, Skull, Star, UserRound } from 'lucide-react';
import { api, type CharacterDoc } from '../api';
import * as R from '../../shared/rules';
import { Skeleton } from '../ui';

const OWN_KEY = 'grimoire.party.own';
const REFRESH_MS = 15000;

/** Vue d'ensemble du groupe pour le Maître du Donjon : PV, CA, valeurs passives, états, concentration. */
export default function PartyPage() {
  const [list, setList] = useState<CharacterDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [own, setOwn] = useState(() => {
    try { return localStorage.getItem(OWN_KEY) === '1'; } catch { return false; }
  });
  const [at, setAt] = useState<Date | null>(null);

  const load = useCallback(() => {
    api.party(own)
      .then((l) => { setList(l.sort((a, b) => a.data.identity.name.localeCompare(b.data.identity.name))); setAt(new Date()); setError(null); })
      .catch((e) => setError(e.message));
  }, [own]);

  useEffect(() => {
    load();
    // Rafraîchissement automatique tant que l'onglet est visible.
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <div className="row spread">
        <h1 className="row" style={{ gap: 8 }}><Crown size={24} style={{ color: 'var(--gold)' }} /> Table du MJ</h1>
        <div className="row small">
          <label className="row">
            <input type="checkbox" checked={own} onChange={(e) => { setOwn(e.target.checked); try { localStorage.setItem(OWN_KEY, e.target.checked ? '1' : '0'); } catch { /* stockage indisponible */ } }} />
            Inclure mes personnages
          </label>
          <button className="btn sm" onClick={load}><RefreshCw size={15} /> Actualiser</button>
          {at && <span className="muted">à {at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {!list ? (
        <div className="party-grid">{[0, 1, 2].map((i) => <div key={i} className="card"><Skeleton lines={5} /></div>)}</div>
      ) : list.length === 0 ? (
        <div className="card muted">
          Aucune fiche. Les joueurs vous désignent comme Maître du Donjon dans Édition › Partage (MJ) de leur fiche.
        </div>
      ) : (
        <div className="party-grid">{list.map((d) => <PartyCard key={d.id} d={d} />)}</div>
      )}
    </div>
  );
}

function PartyCard({ d }: { d: CharacterDoc }) {
  const c = d.data;
  const { hpCurrent, hpMax, hpTemp } = c.combat;
  const pct = Math.max(0, Math.min(100, (hpCurrent / Math.max(1, hpMax)) * 100));
  const fx = R.activeEffects(c);
  const dead = R.isDead(c);
  const dying = hpCurrent === 0 && !dead;
  const dc = R.spellSaveDC(c);
  const defs = R.damageDefenses(c);
  const vals: [string, string | number][] = [
    ['CA', R.armorClass(c)],
    ['Init.', R.fmtMod(R.initiative(c))],
    ['Vitesse', `${R.speed(c)} m`],
    ['DD sorts', dc ?? '—'],
    ['Perception', R.passivePerception(c)],
    ['Perspicacité', R.passiveSkill(c, 'perspicacite')],
    ['Investig.', R.passiveSkill(c, 'investigation')],
    ['Maîtrise', R.fmtMod(R.proficiencyBonus(c))],
  ];
  return (
    <div className={`card stack party-card ${dying ? 'dying' : ''} ${dead ? 'dead' : ''}`}>
      <Link to={`/c/${d.id}`} className="char-card">
        <div className="portrait">
          {c.identity.portrait ? <img src={api.imageUrl(c.identity.portrait, true)} alt="" className="portrait" style={{ border: 0 }} /> : <UserRound size={32} />}
        </div>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0 }}>{c.identity.name}</h3>
          <div className="small muted">{c.classes.map((k) => `${k.name} ${k.level}`).join(' / ') || '—'}{d.role === 'dm' && ` · ${d.owner}`}</div>
        </div>
      </Link>
      <div>
        <div className="row spread small">
          <span><strong className="big-num">{hpCurrent}</strong><span className="muted">/{hpMax}</span>{hpTemp > 0 && <span style={{ color: 'var(--info)' }}> +{hpTemp}</span>}</span>
          <span className="row" style={{ gap: 6 }}>
            {c.combat.heroicInspiration > 0 && <span title="Inspiration"><Star size={14} fill="var(--gold)" style={{ color: 'var(--gold)' }} /> {c.combat.heroicInspiration}</span>}
            {dying && <span className="chip warn"><Skull size={12} /> À terre {c.combat.deathSaves.success}✓ {c.combat.deathSaves.failure}✗</span>}
            {dead && <span className="chip warn"><Skull size={12} /> Mort</span>}
          </span>
        </div>
        <div className="hp-bar" aria-hidden><span style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="vals">
        {vals.map(([k, v]) => <div key={k}><div className="v">{v}</div><div className="k">{k}</div></div>)}
      </div>
      {(c.combat.conditions.length > 0 || c.combat.exhaustion > 0) && (
        <div className="row small" style={{ gap: 4 }}>
          {c.combat.conditions.map((x) => <span key={x} className="chip on">{x}</span>)}
          {c.combat.exhaustion > 0 && <span className="chip warn">Épuisement {c.combat.exhaustion}</span>}
        </div>
      )}
      {(fx.length > 0 || c.combat.concentration) && (
        <div className="row small" style={{ gap: 4 }}>
          {fx.map((e) => <span key={e.id} className="chip effect on"><Flame size={12} /> {e.name}</span>)}
          {c.combat.concentration && <span className="chip"><Focus size={12} /> {c.combat.concentration}</span>}
        </div>
      )}
      {(defs.resistances.length > 0 || defs.immunities.length > 0 || defs.vulnerabilities.length > 0 || c.senses.length > 0) && (
        <div className="small muted stack" style={{ gap: 2 }}>
          {defs.resistances.length > 0 && <div><Shield size={12} /> Résistances : {defs.resistances.join(', ')}</div>}
          {defs.immunities.length > 0 && <div>Immunités : {defs.immunities.join(', ')}</div>}
          {defs.vulnerabilities.length > 0 && <div>Vulnérabilités : {defs.vulnerabilities.join(', ')}</div>}
          {c.senses.length > 0 && <div>Sens : {c.senses.join(', ')}</div>}
        </div>
      )}
    </div>
  );
}
