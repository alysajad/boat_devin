import p5 from 'p5';
import { obstacles, type Race, type Team } from './engine';

const colors = { water: '#57B9BB', deep: '#168E98', bank: '#B8D390', sand: '#E5E7B5', leaf: '#245C38', coral: '#EF6045', gold: '#FFC857' };
export function mountRiver(element: HTMLElement, getRace: () => Race | null, hero = false) {
  let current: Race | null = null;
  let observer: ResizeObserver;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return new p5(p => {
    const smooth = { coral: { x: 0, distance: 0, heading: 0 }, gold: { x: 0, distance: 0, heading: 0 } };
    let lastRound = 0;
    p.setup = () => {
      p.createCanvas(Math.max(1, element.clientWidth), Math.max(1, element.clientHeight));
      p.pixelDensity(Math.min(devicePixelRatio, 2)); p.frameRate(reduced ? 24 : 60);
      p.textFont('Noto Sans');
      observer = new ResizeObserver(() => { if (element.clientWidth) p.resizeCanvas(element.clientWidth, element.clientHeight); });
      observer.observe(element);
      p.describe(hero ? 'Two wooden snake boats on a palm-lined Kerala river.' : 'Live overhead race view with two boats and floating logs.');
      const remove = p.remove.bind(p); p.remove = () => { observer.disconnect(); remove(); };
    };
    function palm(x: number, y: number, s: number, angle = 0) {
      p.push(); p.translate(x, y); p.rotate(angle); p.scale(s);
      p.noFill(); p.stroke('#6D7045'); p.strokeWeight(7); p.bezier(0, 25, 9, 4, -9, -23, 0, -39);
      p.translate(0, -40); p.strokeWeight(1.1); p.stroke('#1F5239');
      for (let i = 0; i < 7; i++) {
        p.push(); p.rotate(i * Math.PI * 2 / 7); p.fill(i % 2 ? '#3B804C' : '#245C38');
        p.beginShape(); p.vertex(0, 0); p.bezierVertex(18, -18, 40, -12, 51, 1); p.bezierVertex(28, -1, 17, 11, 0, 0); p.endShape();
        p.stroke('#80A365'); p.line(5, 0, 39, -1); p.pop();
      }
      p.noStroke(); p.fill('#AC7A43'); p.circle(-3, 1, 8); p.circle(3, -3, 7); p.pop();
    }
    function boat(x: number, y: number, scale: number, team: Team, phase: number, angle: number) {
      p.push(); p.translate(x, y); p.rotate(angle); p.scale(scale);
      const tone = colors[team];
      // Long tapered hull and repeating paddlers make the silhouette unmistakable.
      p.noStroke(); p.fill('#12304725'); p.ellipse(5, 6, 47, 166);
      p.stroke('#FFFFFF85'); p.strokeWeight(2); p.noFill();
      for (let j = 0; j < 3; j++) p.arc(0, 69 + j * 9, 34 + j * 15, 17, 0, Math.PI);
      p.fill('#5C352B'); p.stroke('#362D25'); p.strokeWeight(2);
      p.beginShape(); p.vertex(0, -103); p.bezierVertex(-5, -62, -25, -55, -17, 52); p.bezierVertex(-13, 78, -4, 88, 0, 93); p.bezierVertex(5, 81, 17, 75, 18, 48); p.bezierVertex(24, -56, 5, -70, 0, -103); p.endShape(p.CLOSE);
      p.noStroke(); p.fill('#D19659'); p.ellipse(0, -1, 25, 137); p.fill(tone); p.ellipse(0, -53, 21, 31);
      p.stroke('#7D5435'); p.strokeWeight(1);
      for (let i = 0; i < 7; i++) p.line(-12, -36 + i * 15, 12, -36 + i * 15);
      for (let i = 0; i < 6; i++) {
        const yy = -34 + i * 18;
        for (const side of [-1, 1]) {
          const swing = Math.sin(phase + i * 0.12) * 10;
          p.stroke('#E3BC7A'); p.strokeWeight(3); p.line(side * 9, yy, side * 34, yy + 10 + swing);
          p.stroke(tone); p.strokeWeight(6); p.line(side * 31, yy + 9 + swing, side * 40, yy + 12 + swing);
          p.noStroke(); p.fill(tone); p.ellipse(side * 6, yy + 3, 11, 12); p.fill('#553D31'); p.circle(side * 6, yy - 2, 7);
        }
      }
      p.noStroke(); p.fill(tone); p.triangle(0, -95, 3, -78, 17, -81); p.pop();
    }
    p.draw = () => {
      current = getRace();
      const w = p.width, h = p.height, t = reduced ? 0 : p.millis() / 1000;
      p.background(colors.water);
      const running = current?.phase === 'racing';
      let advance = 0;
      if (current) {
        for (const team of ['coral', 'gold'] as Team[]) {
          const b = current.boats[team], s = smooth[team];
          const factor = reduced || lastRound !== current.round ? 1 : 0.16;
          s.x += (b.x - s.x) * factor; s.distance += (b.distance - s.distance) * factor; s.heading += (b.heading - s.heading) * factor;
        }
        lastRound = current.round;
        advance = Math.max(smooth.coral.distance, smooth.gold.distance);
      }
      const shift = hero ? t * 5 : advance * 5;
      // Flow lines are deterministic, with no generated image or remote asset dependency.
      p.stroke('#D4F5DF60'); p.strokeWeight(1.5);
      for (let i = 0; i < 65; i++) {
        const x = ((i * 97.13) % (w * 0.8)) + w * 0.1;
        const y = ((i * 61.17 + shift) % (h + 40)) - 20;
        p.line(x, y, x + 8 + (i % 4) * 5, y); if (i % 3 === 0) p.line(x + 7, y + 5, x + 18, y + 5);
      }
      p.noStroke();
      // Uneven shorelines, two channels, and garden islands.
      p.fill(colors.sand);
      p.beginShape(); p.vertex(0, 0); p.vertex(w * .10, 0); for (let y = 0; y <= h + 20; y += 20) p.vertex(w * (.08 + .022 * Math.sin(y / 91)), y); p.vertex(0, h); p.endShape(p.CLOSE);
      p.beginShape(); p.vertex(w, 0); p.vertex(w * .91, 0); for (let y = 0; y <= h + 20; y += 20) p.vertex(w * (.92 + .025 * Math.sin(y / 78)), y); p.vertex(w, h); p.endShape(p.CLOSE);
      p.fill(colors.bank); p.rect(0, 0, w * .048, h); p.rect(w * .963, 0, w * .04, h);
      if (!hero) {
        p.stroke('#F5FAF773'); p.strokeWeight(1); p.drawingContext.setLineDash([5, 13]); p.line(w / 2, 0, w / 2, h); p.drawingContext.setLineDash([]);
        p.noStroke();
      }
      palm(w * .07, h * .18, Math.min(w / 500, .95), .3); palm(w * .94, h * .47, Math.min(w / 600, .9), -.45);
      palm(w * .04, h * .82, Math.min(w / 650, .85), -.4); palm(w * .97, h * .95, Math.min(w / 620, .85), .3);
      if (hero) {
        p.push(); p.translate(w * .52, h * .19); p.rotate(-.1); p.noStroke(); p.fill('#EFF5D9'); p.rect(-49, -20, 98, 38, 5); p.fill('#245C38'); p.textSize(10); p.textStyle(p.BOLD); p.textAlign(p.CENTER, p.CENTER); p.text('KOCHI • KERALA', 0, 0); p.pop();
        boat(w * .35, h * .52 + Math.sin(t) * 3, Math.min(w / 400, 1.6), 'coral', t * 5, -.16);
        boat(w * .68, h * .65 + Math.sin(t + 1) * 3, Math.min(w / 440, 1.5), 'gold', t * 5 + 1, .12);
        p.fill('#F5FAF7'); p.noStroke(); p.textSize(11); p.textStyle(p.BOLD); p.textAlign(p.CENTER); p.text('YOUR PHONE IS THE PADDLE.', w / 2, h - 28);
      } else if (current) {
        const boatScale = Math.min(w / 650, .93);
        const pixelsPerMeter = 5;
        for (const team of ['coral', 'gold'] as Team[]) {
          const b = smooth[team], center = w * (team === 'coral' ? .285 : .715);
          const baseY = h * .65;
          for (const log of obstacles(current.seed)) {
            const y = baseY - (log.distance - advance) * pixelsPerMeter;
            if (y < -30 || y > h + 30) continue;
            p.push(); p.translate(center + log.x * w * .18, y); p.rotate(.15); p.stroke('#664E32'); p.strokeWeight(2); p.fill('#AD8455'); p.rect(-w * .043, -5, w * .086, 10, 5); p.stroke('#D3AE78'); p.line(-w * .03, -1, w * .03, -1); p.pop();
          }
          const y = baseY + (advance - b.distance) * pixelsPerMeter;
          boat(center + b.x * w * .18, Math.min(h - 48, y), boatScale, team, running ? t * 10 : 0, b.heading);
          p.fill(colors[team]); p.noStroke(); p.rect(center - 32, 16, 64, 23, 12); p.fill('#123047'); p.textAlign(p.CENTER, p.CENTER); p.textSize(10); p.textStyle(p.BOLD); p.text(team === 'coral' ? 'CORAL' : 'GOLD', center, 27);
          if (y > h - 48) { p.fill('#123047'); p.textSize(10); p.text(`${Math.round(advance - b.distance)}m behind`, center, h - 14); }
        }
        if (current.phase === 'lobby') {
          p.fill('#F5FAF7D9'); p.noStroke(); p.rect(w * .25, h * .15, w * .5, 40, 20); p.fill('#123047'); p.textSize(Math.max(10, Math.min(13, w / 40))); p.textAlign(p.CENTER, p.CENTER); p.text('THE RIVER IS READY. ARE YOU?', w * .5, h * .15 + 20);
        }
      }
    };
  }, element);
}
