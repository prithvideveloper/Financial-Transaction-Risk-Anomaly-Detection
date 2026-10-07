import React, { useEffect, useState } from "react";
import { getModelStatus, loadMLModels, MLModelStatus } from "../lib/mlInference";

interface Props {
  onModelsReady?: () => void;
}

export const MLModelPanel: React.FC<Props> = ({ onModelsReady }) => {
  const [status, setStatus] = useState<MLModelStatus>(getModelStatus());
  const [showFeatures, setShowFeatures] = useState(false);

  useEffect(() => {
    loadMLModels().then(() => {
      const s = getModelStatus();
      setStatus(s);
      if (s.loaded) onModelsReady?.();
    });
    // Poll until loaded
    const id = setInterval(() => {
      const s = getModelStatus();
      setStatus({ ...s });
      if (s.loaded || s.error) clearInterval(id);
    }, 300);
    return () => clearInterval(id);
  }, []);

  const maxImportance = status.metadata?.featureImportance?.[0]?.importance || 1;

  return (
    <div className="ml-panel">
      {/* Header */}
      <div className="ml-panel-header">
        <div className="ml-panel-title">
          <span className="ml-icon">🧠</span>
          <div>
            <div className="ml-panel-name">Hybrid ML Engine</div>
            <div className="ml-panel-subtitle">XGBoost + Isolation Forest</div>
          </div>
        </div>
        <div className={`ml-status-badge ${status.loaded ? "ml-status-active" : status.loading ? "ml-status-loading" : "ml-status-error"}`}>
          {status.loaded ? (
            <><span className="ml-status-dot" />Active</>
          ) : status.loading ? (
            <><span className="ml-spinner" />Loading</>
          ) : (
            <><span className="ml-status-dot ml-dot-error" />Error</>
          )}
        </div>
      </div>

      {status.error && (
        <div className="ml-error-msg">
          ⚠️ {status.error}
        </div>
      )}

      {status.loading && (
        <div className="ml-loading-bar">
          <div className="ml-loading-fill" />
          <span className="ml-loading-text">Loading model weights…</span>
        </div>
      )}

      {status.loaded && status.metadata && (
        <>
          {/* Performance Metrics */}
          <div className="ml-metrics-grid">
            <div className="ml-metric">
              <div className="ml-metric-label">AUC-ROC</div>
              <div className="ml-metric-value ml-val-green">{(status.metadata.hybridAuc * 100).toFixed(1)}%</div>
              <div className="ml-metric-sub">Hybrid Ensemble</div>
            </div>
            <div className="ml-metric">
              <div className="ml-metric-label">F1 Score</div>
              <div className="ml-metric-value ml-val-blue">{(status.metadata.hybridF1 * 100).toFixed(1)}%</div>
              <div className="ml-metric-sub">Harmonic mean</div>
            </div>
            <div className="ml-metric">
              <div className="ml-metric-label">XGB AUC</div>
              <div className="ml-metric-value ml-val-purple">{(status.metadata.xgbAuc * 100).toFixed(1)}%</div>
              <div className="ml-metric-sub">Gradient Boost</div>
            </div>
            <div className="ml-metric">
              <div className="ml-metric-label">Trees</div>
              <div className="ml-metric-value ml-val-orange">{status.metadata.numTrees}</div>
              <div className="ml-metric-sub">XGB + IF total</div>
            </div>
          </div>

          {/* Architecture diagram */}
          <div className="ml-arch">
            <div className="ml-arch-label">Ensemble Architecture</div>
            <div className="ml-arch-flow">
              <div className="ml-arch-block ml-arch-input">
                <div className="ml-arch-block-title">15 Features</div>
                <div className="ml-arch-block-sub">Financial signals</div>
              </div>
              <div className="ml-arch-arrow">→</div>
              <div className="ml-arch-models">
                <div className="ml-arch-block ml-arch-xgb">
                  <div className="ml-arch-block-title">XGBoost</div>
                  <div className="ml-arch-block-sub">65% weight · 70 trees</div>
                </div>
                <div className="ml-arch-block ml-arch-if">
                  <div className="ml-arch-block-title">Isolation Forest</div>
                  <div className="ml-arch-block-sub">35% weight · 80 trees</div>
                </div>
              </div>
              <div className="ml-arch-arrow">→</div>
              <div className="ml-arch-block ml-arch-output">
                <div className="ml-arch-block-title">Hybrid Score</div>
                <div className="ml-arch-block-sub">0–100 risk</div>
              </div>
            </div>
          </div>

          {/* Feature Importance */}
          <div className="ml-features-section">
            <button
              className="ml-features-toggle"
              onClick={() => setShowFeatures(v => !v)}
            >
              <span>Feature Importance</span>
              <span className="ml-toggle-icon">{showFeatures ? "▲" : "▼"}</span>
            </button>

            {showFeatures && (
              <div className="ml-features-list">
                {status.metadata.featureImportance.slice(0, 10).map((f) => (
                  <div key={f.name} className="ml-feature-row">
                    <div className="ml-feature-name">{f.name.replace(/_/g, " ")}</div>
                    <div className="ml-feature-bar-wrap">
                      <div
                        className="ml-feature-bar"
                        style={{ width: `${(f.importance / maxImportance) * 100}%` }}
                      />
                    </div>
                    <div className="ml-feature-pct">{(f.importance * 100).toFixed(1)}%</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ml-trained-at">
            Trained on 1,500 real transactions · Client-side inference
          </div>
        </>
      )}
    </div>
  );
};
