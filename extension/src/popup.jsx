import { h, render } from 'preact';
import thunkMiddleware from 'redux-thunk';
import { applyMiddleware, compose, combineReducers, createStore } from 'redux';
import { Provider, connect } from 'preact-redux';
import persistState from 'redux-localstorage';
import { createLogger } from 'redux-logger';

import { adForRequest, sendAds } from 'utils.js';

// styles
import "../css/styles.css";

const getMessage = chrome.i18n.getMessage;

// Constants
const ToggleType = {
  ADS: "ads",
  RATER: "rater"
};

const RatingType = {
  POLITICAL: "political",
  NORMAL: "normal"
};

// Action Types
const ACCEPT_TERMS = "accept_terms";
const TOGGLE_TAB = "toggle_tab";
const NEW_ADS = "new_ads";
const NEW_RATINGS = "new_ratings";
const ASSIGN_RATING = "assign_rating";

// Actions
const acceptTerms = () => ({ type: ACCEPT_TERMS });
const toggle = (value) => ({ type: TOGGLE_TAB, value });
const assignRating = (id, rating) => ({
  type: ASSIGN_RATING,
  id: id,
  value: rating
});

const rateAd = (ad, rating) => {
  return (dispatch) => {
    let body = {
      ...adForRequest(ad),
      political: rating === RatingType.POLITICAL,
    };
    let cb = () => ({});
    dispatch(assignRating(ad.id, rating));
    return sendAds([body]).then(cb, cb);
  };
};

const newAds = (ads) => ({
  type: NEW_ADS,
  value: ads
});

const newRatings = (ratings) => ({
  type: NEW_RATINGS,
  value: ratings
});

// Reducers
const active = (state = ToggleType.RATER, action) => {
  switch(action.type) {
  case TOGGLE_TAB:
    return action.value;
  default:
    return state;
  }
};

const mergeAds = (ads, newAds) => {
  let ids = new Map(ads.map(ad => [ad.id, ad]));
  newAds.forEach(ad => {
    if(ids.has(ad.id)) {
      let old = ids.get(ad.id);
      ids.delete(ad.id);
      let newAd = Object.assign({}, old, ad);
      ids.set(newAd.id, newAd);
    } else {
      ids.set(ad.id, ad);
    }
  });
  return Array.from(ids.values()).sort((a, b) => a.id > b.id ? 1 : -1);
};

const ads = (state = [], action) => {
  switch(action.type) {
  case NEW_ADS:
    return mergeAds(state, action.value);
  default:
    return state;
  }
};

const ratings = (state = [], action) => {
  switch(action.type) {
  case NEW_RATINGS:
    return mergeAds(state, action.value);
  case ASSIGN_RATING:
    return state.map(rating => {
      if(rating.id === action.id) {
        return { ...rating, rating: action.value };
      }
      return rating;
    });
  default:
    return state;
  }
};

const terms = (state = false, action) => {
  switch(action.type) {
  case ACCEPT_TERMS:
    return true;
  default:
    return state;
  }
};

// The main reducer!
const reducer = combineReducers({
  active,
  ads,
  ratings,
  terms
});

let middleware = [thunkMiddleware];
if(process.env.NODE_ENV === 'development') {
  middleware.push(createLogger());
}
const enhancer = compose(...[persistState(), applyMiddleware(...middleware)]);
let store = createStore(reducer, enhancer);

// Ad utilities
const getUnratedRatings = (ratings) => (
  ratings.filter(rating => rating.rating === RatingType.POLITICAL || !("rating" in rating))
);

let div = document.createElement('div');
const query = (html, selector) => {
  div.innerHTML = html;
  return div.querySelector(selector);
};

const getImage = (html) => {
  let img = query(html, 'img');
  if(img)
    return img.getAttribute('src');
};

const getAdMessage = (html) => {
  let p = query(html, '.userContent p') || query(html, 'span');
  if(p)
    return p.innerHTML;
};

const getTitle = (html) => {
  let a = query(html, 'h5 a') || query(html, 'h6 a') || query(html, 'strong');
  if(a)
    return a.innerText;
};

const insertAdFields = (ads) => (
  ads.map((ad) => ({
    ...ad,
    image: getImage(ad.html),
    message: getAdMessage(ad.html),
    title: getTitle(ad.html)
  }))
);

// Views
const Ad = ({title, message, id, image}) => (
  <div className="ad" id={id}>
    <div className="chiclet">
      {image ? <img src={image} /> : ''}
    </div>
    <div className="ad-display">
      <div className="advertiser">{title}</div>
      <div className="ad-content" dangerouslySetInnerHTML={{__html:message}} />
    </div>
  </div>
);

// Ads from the server to show
let Ads = ({ads}) => (
  <div id="ads">
    {ads.map(ad => <Ad key={ad.id} {...ad} />)}
  </div>
);
Ads = connect((state) => ({
  ads: insertAdFields(state.ads)
}))(Ads);

const RatingForm = ({rating, action})=> (
  <div className="rater">
    {getMessage('rating_question')}
    <button
      id={'normal' + rating.id}
      onClick={function(){ return action(rating, RatingType.NORMAL); }}
    >
      {getMessage('normal')}
    </button>
    <button
      id={'political' + rating.id}
      onClick={function(){ return action(rating, RatingType.POLITICAL); }}
    >
      {getMessage('political')}
    </button>
  </div>
);

// Ads to be rated and sent to the server
const Rating = ({rating, action}) => (
  <div className="rating">
    <Ad
      title={rating.title}
      message={rating.message}
      id={rating.id}
      image={rating.image}
    />
    {("rating" in rating) ? '' : <RatingForm action={action} rating={rating} /> }
  </div>
);

const Ratings = ({onRatingClick, ratings}) => (
  <div id="ratings">
    {ratings.map(rating => (
      <Rating key={rating.id} rating={rating} action={onRatingClick} />)
    )}
  </div>
);

const ratingsStateToProps = (state) => ({
  ratings: insertAdFields(getUnratedRatings(state.ratings))
});

const ratingsDispatchToProps = (dispatch) => ({
  onRatingClick: (id, rating) => {
    dispatch(rateAd(id, rating));
  }
});

const UnratedRatings = connect(
  ratingsStateToProps,
  ratingsDispatchToProps
)(Ratings);

// Controls which section of tabs to show, defaults to the
const Toggle = ({type, message, active, onToggleClick}) => (
  <div
    className={'toggle' + (active === type ? ' active' : '')}
    onClick={function() { onToggleClick(type); }}
  >
    {getMessage(message)}
  </div>
);


// Our Main container.
let Toggler = ({ads, ratings, active, onToggleClick}) => (
  <div id="toggler">
    <div id="tabs">
      <Toggle
        active={active}
        message="rate_ads" onToggleClick={onToggleClick}
        type={ToggleType.RATER}
      />
      <Toggle
        active={active}
        message="see_ads" onToggleClick={onToggleClick}
        type={ToggleType.ADS}
      />
    </div>
    <div id="container">
      {active === ToggleType.ADS ?
        <Ads ads={ads} /> :
        <UnratedRatings ratings={ratings} />}
    </div>
  </div>
);

const togglerDispatchToProps = (dispatch) => ({
  onToggleClick: (type) => {
    dispatch(toggle(type));
  }
});

Toggler = connect(
  (state) => (state),
  togglerDispatchToProps
)(Toggler);

const Onboarding = ({onAcceptClick}) => (
  <div id="tos">
    <button id="accept" onClick={function(){ return onAcceptClick(); }}>
      Accept
    </button>
  </div>
);

let Dispatcher = ({terms, onAcceptClick}) => {
  if(terms) {
    return <Toggler />;
  } else {
    return <Onboarding onAcceptClick={onAcceptClick}/>;
  }
};

const dispatchToProps = (dispatch) => ({
  onAcceptClick: () => {
    dispatch(acceptTerms());
  }
});

Dispatcher = connect(
  (state) => ({terms: state.terms}),
  dispatchToProps
)(Dispatcher);

render(
  <Provider store={store}>
    <div id="popup">
      <Dispatcher />
    </div>
  </Provider>,
  document.body
);

// connect to the ratings channel
chrome.runtime.onMessage.addListener((ads) => store.dispatch(newRatings(ads)));
store.subscribe(() => chrome.runtime.sendMessage(store.getState().ads));
