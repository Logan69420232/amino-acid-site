# Usage: Rscript reproduce.R snapshot.json > recalculated.json
# Requires jsonlite (install.packages("jsonlite") once).
# Runs locally; it does not send your diary to a service.
library(jsonlite)
s <- fromJSON(commandArgs(trailingOnly=TRUE)[1], simplifyVector=FALSE)
stopifnot(s$schema == "aminodata-calculation/v1")
z <- function(x) if(is.null(x)) 0 else x
calc <- function(day) {
  totals <- list()
  for(e in day$entries) {
    q <- e$portion$quantity
    if(q <= 0) next
    for(n in e$inputs) {
      t <- totals[[n$key]]
      if(is.null(t)) t <- list(unit=n$unit,value=NULL,known=0,unknown=0,trace=0,derived=0)
      if(!is.null(n$per100)) {t$value <- z(t$value)+n$per100*q/100; t$known <- t$known+1}
      else if(!n$trace) t$unknown <- t$unknown+1
      t$trace <- t$trace+as.integer(n$trace)
      t$derived <- t$derived+as.integer(n$status=="derived_partial")
      totals[[n$key]] <- t
    }
  }
  protein <- 0
  for(e in day$entries) if(e$aminoProfileAvailable && e$portion$quantity>0)
    for(n in e$inputs) if(n$key=="protein") protein <- protein+z(n$per100)*e$portion$quantity/100
  amino <- list()
  r <- s$references
  for(k in names(r$aminoGroups)) {
    ts <- lapply(r$aminoGroups[[k]], function(c) totals[[paste0("aa:",c)]])
    mg <- if(any(vapply(ts,function(t)!is.null(t$value),logical(1)))) sum(vapply(ts,function(t)z(t$value)*1000,numeric(1))) else NULL
    target <- r$aminoMgPerKg[[k]]*day$weightKg*(day$proteinGoalG/(day$weightKg*r$proteinBaselineGPerKg))
    amino[[k]] <- list(mg=mg,targetMg=target,percent=if(is.null(mg)) NULL else mg/target*100,
      partial=any(vapply(ts,function(t)z(t$unknown)>0||z(t$trace)>0,logical(1))),
      compositionMgPerG=if(protein>0) mg/protein else NULL,patternMgPerG=r$aminoPatternMgPerG[[k]])
  }
  omega <- lapply(c("epa","dha"),function(k)totals[[k]])
  epaDha <- list(valueMg=if(any(vapply(omega,function(t)!is.null(t$value),logical(1)))) sum(vapply(omega,function(t)z(t$value)*1000,numeric(1))) else NULL,
    targetMg=day$epaDhaGoalMg,partial=any(vapply(omega,function(t)is.null(t)||z(t$unknown)>0||z(t$trace)>0,logical(1))))
  list(date=day$date,totals=totals,amino=amino,epaDha=epaDha)
}
cat(toJSON(list(versions=s$versions,days=lapply(s$days,calc)),auto_unbox=TRUE,null="null",digits=NA,pretty=TRUE))
