import React, { useState, useEffect } from 'react';
import { X, Check, Sparkles, Crown, Shield, Star, Info, Zap } from 'lucide-react';
import { toast } from 'react-hot-toast';
import './Membership.css';

export type PlanType = 'FREE' | 'PLUS' | 'PRO';

export interface PlanDetails {
  name: PlanType;
  price: string;
  badgeText: string;
  badgeClass: string;
  features: string[];
  color: string;
  buttonClass: string;
}

export const PLANS: Record<PlanType, PlanDetails> = {
  FREE: {
    name: 'FREE',
    price: '₹0/month',
    badgeText: 'FREE',
    badgeClass: 'badge-free',
    features: [
      'Join Events',
      'Create Profile',
      'Basic Chat',
      'Basic Explore Access'
    ],
    color: '#8E8B82',
    buttonClass: 'btn-plan-free'
  },
  PLUS: {
    name: 'PLUS',
    price: '₹699/month',
    badgeText: 'PLUS',
    badgeClass: 'badge-plus',
    features: [
      'Everything in Free',
      'Unlimited Event Saves',
      'Priority Event Recommendations',
      'Enhanced Profile',
      'Advanced Search Filters',
      'Premium Badge'
    ],
    color: 'linear-gradient(135deg, #60A5FA, #A78BFA)',
    buttonClass: 'btn-plan-plus'
  },
  PRO: {
    name: 'PRO',
    price: '₹999/month',
    badgeText: 'PRO',
    badgeClass: 'badge-pro',
    features: [
      'Everything in Plus',
      'Verified Pro Badge',
      'Featured Profile Placement',
      'Priority Matchmaking',
      'Event Promotion Credits',
      'Exclusive Rewards',
      'Premium Analytics'
    ],
    color: 'linear-gradient(135deg, #F59E0B, #EAB308)',
    buttonClass: 'btn-plan-pro'
  }
};

// Custom event name for syncing plan state
export const PLAN_CHANGE_EVENT = 'zenex-plan-changed';

export const getSavedPlan = (): PlanType => {
  const plan = localStorage.getItem('zenex-membership-plan');
  if (plan === 'PLUS' || plan === 'PRO') return plan;
  return 'FREE';
};

export const savePlan = (plan: PlanType) => {
  localStorage.setItem('zenex-membership-plan', plan);
  window.dispatchEvent(new Event(PLAN_CHANGE_EVENT));
};

interface MembershipModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MembershipModal: React.FC<MembershipModalProps> = ({ isOpen, onClose }) => {
  const [currentPlan, setCurrentPlan] = useState<PlanType>(getSavedPlan);

  useEffect(() => {
    const handlePlanChange = () => {
      setCurrentPlan(getSavedPlan());
    };
    window.addEventListener(PLAN_CHANGE_EVENT, handlePlanChange);
    return () => {
      window.removeEventListener(PLAN_CHANGE_EVENT, handlePlanChange);
    };
  }, []);

  if (!isOpen) return null;

  const handlePlanAction = (targetPlan: PlanType) => {
    if (targetPlan === currentPlan) return;

    savePlan(targetPlan);
    
    if (targetPlan === 'FREE') {
      toast.success('Subscription cancelled. You are now on the FREE plan.');
    } else {
      toast.success(`Successfully upgraded to ${targetPlan}!`);
    }
  };

  return (
    <div className="membership-modal-overlay" onClick={onClose}>
      <div className="membership-modal-content animate-slideUp" onClick={(e) => e.stopPropagation()}>
        <button className="membership-modal-close" onClick={onClose} aria-label="Close modal">
          <X size={20} />
        </button>

        <div className="membership-modal-header">
          <div className="membership-header-badge">
            <Sparkles size={16} />
            <span>ZENEX PREMIUM</span>
          </div>
          <h2>Level Up Your Experience</h2>
          <p>Choose the perfect plan to connect, play, and experience local events near you.</p>
        </div>

        <div className="plans-comparison-grid">
          {(Object.keys(PLANS) as PlanType[]).map((key) => {
            const plan = PLANS[key];
            const isCurrent = currentPlan === key;
            const isPro = key === 'PRO';
            const isPlus = key === 'PLUS';

            return (
              <div 
                key={key} 
                className={`plan-compare-card ${key.toLowerCase()}-card ${isCurrent ? 'active-plan' : ''} ${isPro ? 'featured-plan' : ''}`}
              >
                {isPro && <div className="featured-ribbon">POPULAR CHOICE</div>}
                
                <div className="plan-card-header">
                  <div className="plan-badge-row">
                    <span className={`plan-badge-pill ${plan.badgeClass}`}>{plan.badgeText}</span>
                    {isCurrent && <span className="current-indicator">ACTIVE</span>}
                  </div>
                  <h3>{plan.name}</h3>
                  <div className="plan-price">
                    <span className="price-val">{plan.price.split('/')[0]}</span>
                    <span className="price-period">/{plan.price.split('/')[1]}</span>
                  </div>
                </div>

                <div className="plan-card-features">
                  <span className="features-title">FEATURES</span>
                  <ul>
                    {plan.features.map((feature, idx) => (
                      <li key={idx}>
                        <Check size={16} className="feature-check" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="plan-card-action">
                  <button
                    type="button"
                    className={`plan-action-btn ${isCurrent ? 'btn-current' : plan.buttonClass}`}
                    onClick={() => handlePlanAction(key)}
                    disabled={isCurrent}
                  >
                    {isCurrent ? 'Current Plan' : key === 'FREE' ? 'Downgrade to Free' : 'Upgrade Plan'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="membership-modal-footer">
          <div className="footer-info-item">
            <Shield size={14} />
            <span>Secure 256-bit SSL encrypted payments</span>
          </div>
          <div className="footer-info-item">
            <Info size={14} />
            <span>Cancel or change plans anytime in your Profile Settings</span>
          </div>
        </div>
      </div>
    </div>
  );
};
