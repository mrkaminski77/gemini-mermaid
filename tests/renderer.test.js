import { beforeEach, describe, expect, it } from 'vitest';
import mermaid from 'mermaid';
import { isDarkMode, parseSvgMarkup } from '../src/renderer.js';

describe('renderer utilities & real mermaid parser', () => {
  beforeEach(() => {
    document.body.className = '';
    document.documentElement.className = '';
    document.body.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-theme');
  });

  it('detects light and dark theme classes/attributes', () => {
    expect(isDarkMode(document)).toBe(false);

    document.body.classList.add('dark-theme');
    expect(isDarkMode(document)).toBe(true);

    document.body.classList.remove('dark-theme');
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(isDarkMode(document)).toBe(true);
  });

  it('safely parses valid SVG markup into an SVGElement', () => {
    const svgEl = parseSvgMarkup(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50"/></svg>',
      document
    );
    expect(svgEl.tagName.toLowerCase()).toBe('svg');
    expect(svgEl.getAttribute('viewBox')).toBe('0 0 100 50');
  });

  it('validates real Mermaid syntax via mermaid.parse()', async () => {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    const valid = await mermaid.parse('flowchart TD\n  A[Start] --> B[End]', {
      suppressErrors: true
    });
    expect(valid).not.toBe(false);

    const invalid = await mermaid.parse('flowchart TD\n  A -->', {
      suppressErrors: true
    });
    expect(invalid).toBe(false);
  });

  it('validates the exact Gemini Skeletal Joints flowchart via mermaid.parse()', async () => {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false });
    const src = `flowchart TD
    Root[Human Skeletal Joints] --> Structural[Structural Classification<br/>By Tissue Type]
    Root --> Functional[Functional Classification<br/>By Degree of Movement]

    %% Structural Branch
    Structural --> Fibrous[Fibrous<br/>Dense Connective Tissue]
    Structural --> Cartilaginous[Cartilaginous<br/>Hyaline or Fibrocartilage]
    Structural --> Synovial[Synovial<br/>Fluid-Filled Joint Cavity]

    Fibrous --> Sutures[Sutures<br/>e.g., Cranial bones]
    Fibrous --> Syndesmoses[Syndesmoses<br/>e.g., Tibia-Fibula shaft]
    Fibrous --> Gomphoses[Gomphoses<br/>e.g., Tooth in socket]

    Cartilaginous --> Synchondroses[Synchondroses - Hyaline<br/>e.g., Epiphyseal plates, 1st rib-sternum]
    Cartilaginous --> Symphyses[Symphyses - Fibrocartilage<br/>e.g., Pubic symphysis, Intervertebral discs,<br/>Sacrococcygeal joint]

    Synovial --> Plane[Plane / Gliding<br/>e.g., Intercarpal, Intertarsal, Facet joints]
    Synovial --> Hinge[Hinge<br/>e.g., Elbow, Knee, Ankle]
    Synovial --> Pivot[Pivot<br/>e.g., Atlantoaxial C1-C2]
    Synovial --> Condyloid[Condyloid / Ellipsoid<br/>e.g., Wrist radiocarpal, Knuckles]
    Synovial --> Saddle[Saddle<br/>e.g., Thumb carpometacarpal]
    Synovial --> BallSocket[Ball-and-Socket<br/>e.g., Shoulder, Hip]

    %% Functional Branch
    Functional --> Synarthrosis[Synarthrosis<br/>Immovable]
    Functional --> Amphiarthrosis[Amphiarthrosis<br/>Slightly Movable]
    Functional --> Diarthrosis[Diarthrosis<br/>Freely Movable]

    %% Cross-links showing functional mapping
    Sutures -.-> Synarthrosis
    Gomphoses -.-> Synarthrosis
    Synchondroses -.-> Synarthrosis

    Syndesmoses -.-> Amphiarthrosis
    Symphyses -.-> Amphiarthrosis

    Synovial -.-> Diarthrosis

    %% Highlighting joints prone to fusion/ossification from previous topic
    classDef fusionProne fill:#f9f,stroke:#333,stroke-width:2px,color:#000;
    class Synchondroses,Symphyses,Plane fusionProne;`;

    const result = await mermaid.parse(src, { suppressErrors: true });
    expect(result).not.toBe(false);
  });
});
