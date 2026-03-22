const pageShell = document.querySelector(".page-shell");
const heroCard = document.querySelector(".hero-card");

function createRipple(x, y) {
  const ripple = document.createElement("span");
  ripple.className = "interaction-ripple";
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  document.body.appendChild(ripple);

  window.setTimeout(() => {
    ripple.remove();
  }, 1200);
}

function createSpark(x, y, index) {
  const spark = document.createElement("span");
  spark.className = "pointer-spark";
  spark.style.left = `${x}px`;
  spark.style.top = `${y}px`;
  spark.style.setProperty("--spark-x", `${(Math.random() - 0.5) * 80}px`);
  spark.style.setProperty("--spark-y", `${-30 - Math.random() * 70}px`);
  spark.style.animationDelay = `${index * 40}ms`;
  document.body.appendChild(spark);

  window.setTimeout(() => {
    spark.remove();
  }, 1000);
}

function burstSparks(x, y) {
  for (let i = 0; i < 6; i += 1) {
    createSpark(x, y, i);
  }
}

function tiltHeroCard(event) {
  if (!heroCard) {
    return;
  }

  const bounds = heroCard.getBoundingClientRect();
  const relativeX = (event.clientX - bounds.left) / bounds.width - 0.5;
  const relativeY = (event.clientY - bounds.top) / bounds.height - 0.5;
  heroCard.style.transform =
    `perspective(1200px) rotateX(${relativeY * -5}deg) rotateY(${relativeX * 7}deg)`;
}

function resetHeroCardTilt() {
  if (heroCard) {
    heroCard.style.transform = "";
  }
}

if (pageShell) {
  pageShell.addEventListener("click", (event) => {
    createRipple(event.clientX, event.clientY);
    burstSparks(event.clientX, event.clientY);
  });
}

if (heroCard) {
  heroCard.addEventListener("pointermove", tiltHeroCard);
  heroCard.addEventListener("pointerleave", resetHeroCardTilt);
}
