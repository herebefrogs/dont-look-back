/**
 * Screen-manager component
 *
 * Applied to: a-scene
 * Purpose: toggle the game between the 3 states (title screen > game screen > end screen)
 * and show/hide entities appropriate to the current game state
 */
AFRAME.registerComponent('screen-manager', {
  schema: {},
  init: function() {
    // set the game state to title screen
    this.el.addState('title-screen');

    // cache references to different entities for performance
    this.titleEl = this.el.querySelector('#title');
    this.startButtonEl = this.el.querySelector('#start-button');
    this.endEl = this.el.querySelector('#end');
    this.timerEl = this.el.querySelector('#timer');
    this.shotsEl = this.el.querySelector('#shots');
    this.chickenEls = Array.from(this.el.querySelectorAll('.chicken'));
    this.outlawEls = Array.from(this.el.querySelectorAll('.outlaw:not(.coil)'));

    // bind callbacks to this a-scene so they have access to the entity references above ^^^
    this.onGameStart = AFRAME.utils.bind(this.onGameStart, this);
    this.onStateRemoved = AFRAME.utils.bind(this.onStateRemoved, this);
    this.onShotFired = AFRAME.utils.bind(this.onShotFired, this);
    this.addExtraContent = AFRAME.utils.bind(this.addExtraContent, this);

    // setup listeners to start the game and count shots fired
    this.startButtonEl.addEventListener('mouseenter', this.onGameStart);
    this.outlawEls.forEach(function(outlawEl) {
      outlawEl.addEventListener('stateremoved', this.onShotFired);
    });

    // check for Web Monetization support
    if (document.monetization) {
      // check if Web Monetization has started
      if (document.monetization.state === 'started') {
        // add extra content for Coil subscriber
        this.addExtraContent();
      // or setup a listener to add extra content when Web Monetization has finished starting
      } else if (document.monetization.state === 'pending') {
        document.monetization.addEventListener('monetizationstart', this.addExtraContent);
      }
    }
  },
  // triggered when player gazed at the start button
  onGameStart: function() {
    // remove listener to avoid restart mid-game
    this.startButtonEl.removeEventListener('mouseenter', this.onGameStart);

    // toggle game state to game screen
    this.el.addState('game-screen');
    this.el.removeState('title-screen');

    // initialize game timer and shots counter
    this.elapsedTime = 0;
    this.shotsFired = 0;

    // hide chickens/practice targets
    [this.titleEl, ...this.chickenEls].forEach(function(elToHide) {
      elToHide.setAttribute('visible', false);
    });

    // show game timer and shots counter in HUD, and outlaws
    [this.timerEl, this.shotsEl, ...this.outlawEls].forEach(function(elToShow) {
      elToShow.setAttribute('visible', true);
    });
    // hack: to prevent outlaws from being shot (though hidden) while practicing on the chicken
    // they are placed below the ground plane to prevent gaze interaction with them
    this.outlawEls.forEach(function(outlawEl) {
      outlawEl.object3D.position.y += 101;
    });
  },
  // AFRAME callback on every frame
  tick: function(currentTime, elapsed) {
    if (this.el.is('game-screen')) {
      // when game has started, increase time counter
      this.elapsedTime += elapsed / 1000;
      const minutes = Math.floor(this.elapsedTime / 60)
      const seconds = Math.floor(this.elapsedTime - minutes);
      this.timerEl.setAttribute('value', `time\n${minutes}:${seconds < 10 ? '0': ''}${seconds}`);

      // check if all outlaws have been shot (end game condition)
      if (!this.outlawEls.find(function(outlawEl) { return outlawEl.is('up') })) {
        // toggle game state to end screen
        this.el.removeState('game-screen');
        this.el.addState('end-screen');
        // show end game message in HUD
        this.endEl.setAttribute('visible', true);
      }
    }
  },
  // triggered when player gazed at an outlaw
  onShotFired: function(evt) {
    // on the very first outlaws show down...
    if (!this.shotsFired) {
      // ... hide the start button and move it below ground to avoid gaze interaction
      this.startButtonEl.setAttribute('visible', false);
      this.startButtonEl.object3D.position.y -= 100;
    }
    // increase shots counter and update HUD
    this.shotsFired += 1;
    this.shotsEl.setAttribute('value', `shots\n${this.shotsFired}`);
  },
  // triggered when Web Monetization has finished loading
  addExtraContent: function() {
    // include the 2 extra outlaws for Coil subscriber
    this.outlawEls = Array.from(this.el.querySelectorAll('.outlaw'));
    // customize messages to address player as Cowboy Coil
    this.startButtonEl.setAttribute('value', 'Oh boy, you looked back!\nNow the outlaws are after you.\nI sure hope you\'re a fast gun, Cowboy Coil!');
    this.endEl.setAttribute('value', 'You survived, Cowboy Coil!\n\nYou really are the fastest gun\nin the whole wild West!');
  },
});

/**
 * Target component
 *
 * Applied to: chicken and outlaws entities
 * Purpose: Handle gaze interaction with chicken & outlaws, maintain their state (up or down)
 * and animate their sprite accordingly (flip it down, or string it up)
 */
AFRAME.registerComponent('target', {
  schema: {
    // indicate which other targets (designated by a CSS selector) should spring up when this target is shot
    revive: {
      // hack: a selector that has very little chance to match anything, so selectorAll returns an empty array
      default: '#null.null',
      type: 'selectorAll',
    },
    // TODO these 3 properties should be split into a separate component
    // sprite of the target
    texture: {
      type: 'string',
    },
    // width & height of sprite
    height: {
      type: 'number',
    },
    width: {
      type: 'number',
    }
  },
  init: function() {
    // hack related to stateremoved
    this.isOutlaw = this.el.getDOMAttribute('class').includes('outlaw');
    // initialize target as up (not shot at yet)
    this.el.addState('up');

    // add target sprite within current entity
    this.targetEl = document.createElement('a-plane');
    this.targetEl.setAttribute('material', { alphaTest: 0.5 }); // alphaTest setting makes empty pixel of sprite transparent
    this.targetEl.setAttribute('src', this.data.texture);
    this.targetEl.setAttribute('width', this.data.width);
    this.targetEl.setAttribute('height', this.data.height);
    this.targetEl.object3D.position.set(0, this.data.height / 2, 0);
    this.el.appendChild(this.targetEl);

    // bind callbacks to this entity
    this.onShot = AFRAME.utils.bind(this.onShot, this);
    this.onDeadOrAlive = AFRAME.utils.bind(this.onDeadOrAlive, this);
    this.onRevive = AFRAME.utils.bind(this.onRevive, this);

    // setup listener to gaze interaction
    this.el.addEventListener('mouseenter', this.onShot);
  },
  // triggered when player looked at target (aka shot it down)
  onShot: function() {
    // check if the target was previously up
    if (this.el.is('up')) {
      // toggle its state to down
      this.el.removeState('up');

      const animationConfig = {
        from: 0,
        dur: 800,
      }
      // check if target is currently animating up
      if (this.el.components.animation) {
        const currentAnimation = this.el.components.animation.animation;
        // start animating down at the current angle, and reduce the total animation time
        // by the amount elapsed on the current animation, to keep it snappy
        animationConfig.dur -= currentAnimation.currentTime;
        animationConfig.from = currentAnimation.animations[0].currentValue;
      }

      // set or replace current animation
      this.el.setAttribute('animation', {
        ...animationConfig,
        property: 'object3D.rotation.x',
        to: -90,
        easing: 'easeOutElastic',
        elasticity: 800,
      });
      // setup a listener for when the animation is complete
      this.el.addEventListener('animationcomplete', this.onDeadOrAlive);

      // revive linked targets
      this.data.revive.forEach(function(targetEl) {
        targetEl.components.target.onRevive();
      });

      // hack: the listener registed by screen-manager on this target component's stateremoved event
      // never fires, so call the listener directly, introducing an ugly coupling between the target
      // and screen manager components, but I ran out of time to fix this problem
      if (this.isOutlaw) {
        this.el.sceneEl.components['screen-manager'].onShotFired();
      }
    }
  },
  // triggered when an animation complete
  onDeadOrAlive: function() {
    // clean up animation component and listener
    this.el.removeAttribute('animation');
    this.el.removeEventListener('animationcomplete', this.onDeadOrAlive);
  },
  // triggered when another target is shot
  onRevive: function() {
    // check if the target is currently down (aka shot)
    if (!this.el.is('up')) {
      // toggle its state to up
      this.el.addState('up');

      const animationConfig = {
        from: -90,
        dur: 800,
      }
      // check if target is currently animating down
      if (this.el.components.animation) {
        // start animating up at the current angle, and reduce the total animation time
        // by the amount elapsed on the current animation, to keep it snappy
        const currentAnimation = this.el.components.animation.animation;
        animationConfig.dur -= currentAnimation.currentTime;
        animationConfig.from = currentAnimation.animations[0].currentValue;
      }

      // set or replace current animation
      this.el.setAttribute('animation', {
        ...animationConfig,
        property: 'object3D.rotation.x',
        to: 0,
        easing: 'easeOutElastic',
        elasticity: 800,
      });

      // setup a listener for when the animation is complete
      this.el.addEventListener('animationcomplete', this.onDeadOrAlive);
    }
  },
});
