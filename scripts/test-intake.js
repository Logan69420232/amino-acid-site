const { test } = require('node:test');
const assert = require('node:assert/strict');
const intake = require('../lib/intake-targets');

test('adult male energy estimates match the four published equations, rounded to 50 kcal', () => {
  const expected = [2600, 2850, 3000, 3300];
  intake.activities.forEach((a,i) => assert.equal(intake.estimate(75,{activity:a.id,age:30,height:175,sex:'male'}).calories,expected[i]));
});
test('adult female estimates use their own coefficients', () => {
  const expected = [2100,2250,2400,2600];
  intake.activities.forEach((a,i) => assert.equal(intake.estimate(65,{activity:a.id,age:30,height:165,sex:'female'}).calories,expected[i]));
});
test('protein starting targets rise with activity; absent activity is not silently guessed', () => {
  assert.deepEqual(intake.activities.map(a=>intake.estimate(75,{activity:a.id}).protein),[60,90,120,135]);
  assert.equal(intake.estimate(75,{}).protein,null);
  assert.equal(intake.estimate(75,{activity:'not-a-level'}).calories,null);
});
test('calorie estimates need all inputs, while protein only needs adult scope, weight and activity', () => {
  const p={activity:'active',age:30,height:175,sex:'male'};
  for(const key of ['age','height','sex']) {
    const partial={...p};delete partial[key];
    assert.equal(intake.estimate(75,partial).calories,null);
    assert.equal(intake.estimate(75,partial).protein,120);
  }
});
test('under-19, manual scope and invalid weight do not get automatic targets', () => {
  const p={activity:'active',age:30,height:175,sex:'male'};
  for(const profile of [{...p,age:18},{...p,scope:'manual'}]) {
    assert.equal(intake.estimate(75,profile).calories,null);
    assert.equal(intake.estimate(75,profile).protein,null);
  }
  for(const weight of ['',NaN,Infinity,0,-5,250]) assert.equal(intake.estimate(weight,p).calories,null);
});
test('manual calories survive activity changes and malformed values cannot become targets', () => {
  assert.equal(intake.calorieTarget(75,{activity:'very',calorieMode:'manual',customCalories:2450}),2450);
  for(const value of ['',0,-100,'x',Infinity,999999]) assert.equal(intake.calorieTarget(75,{calorieMode:'manual',customCalories:value}),null);
  assert.equal(intake.normalise(null).activity,'');
});
